// ルームごとの通知設定フック
// Firestoreでユーザーごとにルーム通知設定を管理

import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export function useRoomNotificationSettings(enabled = true) {
  const { currentUser } = useAuth();
  const currentUserId = currentUser?.uid ?? null;
  const [mutedRooms, setMutedRooms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Firestoreからミュート設定を購読
  useEffect(() => {
    if (!currentUserId || !enabled) {
      // ログアウト時に購読対象がなくなるため state をリセット
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMutedRooms(new Set());
      setLoading(false);
      return;
    }

    const settingsRef = collection(db, 'users', currentUserId, 'notificationSettings');

    const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
      const muted = new Set<string>();
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.muted === true) {
          muted.add(doc.id);
        }
      });
      setMutedRooms(muted);
      setLoading(false);
    }, (error) => {
      console.error('[useRoomNotificationSettings] エラー:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUserId, enabled]);

  // ルームのミュート状態を確認
  const isRoomMuted = useCallback((roomId: string): boolean => {
    return mutedRooms.has(roomId);
  }, [mutedRooms]);

  // ミュート状態をトグル
  const toggleMute = useCallback(async (roomId: string): Promise<void> => {
    if (!currentUserId) return;

    const settingRef = doc(db, 'users', currentUserId, 'notificationSettings', roomId);
    const isMuted = mutedRooms.has(roomId);

    try {
      if (isMuted) {
        // ミュート解除
        await deleteDoc(settingRef);
        console.log('[useRoomNotificationSettings] ミュート解除:', roomId);
      } else {
        // ミュート設定
        await setDoc(settingRef, {
          muted: true,
          mutedAt: serverTimestamp()
        });
        console.log('[useRoomNotificationSettings] ミュート設定:', roomId);
      }
    } catch (error) {
      console.error('[useRoomNotificationSettings] トグルエラー:', error);
      throw error;
    }
  }, [currentUserId, mutedRooms]);

  return {
    mutedRooms,
    isRoomMuted,
    toggleMute,
    loading
  };
}
