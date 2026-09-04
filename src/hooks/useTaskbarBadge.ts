// Electron タスクバーの未読件数バッジを更新する副作用フック。
// 通知設定（enableNotifications）とは完全に独立して動作する。

import { useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useActiveRoom } from '../contexts/ActiveRoomContext';
import { useChatRooms } from './useChatRooms';
import { isElectronEnv } from './useElectronNotification';
import { formatBadgeLabel, normalizeBadgeCount } from '../lib/electron/badge';
import { createBadgeIconDataUrl } from '../utils/badgeIcon';
import { getUnreadCount } from '../utils/room';

export function useTaskbarBadge(): void {
  const { currentUser } = useAuth();
  const isElectron = isElectronEnv();
  const { chatRooms } = useChatRooms(isElectron ? currentUser : null);
  const { activeRoomId } = useActiveRoom();
  const lastSentCountRef = useRef<number | null>(null);

  const totalUnread = useMemo(() => {
    if (!currentUser) return 0;
    // IPC へ渡す前に 0 以上の整数へ正規化しておく
    return normalizeBadgeCount(
      chatRooms.reduce(
        (sum, room) => sum + getUnreadCount(room, currentUser.uid, activeRoomId),
        0,
      ),
    );
  }, [chatRooms, currentUser, activeRoomId]);

  // アンマウント時（ログアウトで親が外す場合を含む）にバッジをクリア
  useEffect(() => {
    return () => {
      if (!isElectron || !window.electronAPI?.setUnreadBadge) return;
      lastSentCountRef.current = 0;
      void window.electronAPI.setUnreadBadge(0, null).catch((error) => {
        console.error('タスクバーバッジのクリアに失敗:', error);
      });
    };
  }, [isElectron]);

  useEffect(() => {
    if (!isElectron || !window.electronAPI?.setUnreadBadge) return;

    // ログアウト時はバッジをクリア
    if (!currentUser) {
      if (lastSentCountRef.current !== 0) {
        lastSentCountRef.current = 0;
        void window.electronAPI.setUnreadBadge(0, null).catch((error) => {
          console.error('タスクバーバッジのクリアに失敗:', error);
        });
      }
      return;
    }

    // 合計が変わったときだけ IPC を送る
    if (lastSentCountRef.current === totalUnread) return;
    lastSentCountRef.current = totalUnread;

    if (totalUnread <= 0) {
      void window.electronAPI.setUnreadBadge(0, null).catch((error) => {
        console.error('タスクバーバッジのクリアに失敗:', error);
      });
      return;
    }

    const label = formatBadgeLabel(totalUnread);
    const dataUrl = label ? createBadgeIconDataUrl(label) : null;
    void window.electronAPI.setUnreadBadge(totalUnread, dataUrl).catch((error) => {
      console.error('タスクバーバッジの更新に失敗:', error);
    });
  }, [currentUser, isElectron, totalUnread]);
}
