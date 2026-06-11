// 既読更新と未読メッセージ取得を担当する hook
//
// 役割:
// - 表示中のメッセージのうち未読のものに対し、自分の UID を readBy に追加
// - chatRooms/{roomId}/readStates/{uid} に lastReadAt を保存
// - 「最初の未読メッセージ ID」を返すユーティリティを提供（未読ジャンプ用）
//
// ルーム切り替え時には内部の "処理済みセット" をリセットし、別ルームの既読処理に
// 干渉しないようにする。

import { useCallback, useEffect, useRef } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  doc,
  setDoc,
  writeBatch,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ExtendedMessage } from '../types';

interface UseReadReceiptArgs {
  roomId: string | undefined;
  messages: ExtendedMessage[];
  currentUser: FirebaseUser | null;
}

export function useReadReceipt({ roomId, messages, currentUser }: UseReadReceiptArgs) {
  // 最初の未読メッセージ ID を取得（未読ジャンプ等で利用）
  const getFirstUnreadMessageId = useCallback((): string | null => {
    if (!currentUser || messages.length === 0) return null;

    for (const message of messages) {
      if (message.senderId === currentUser.uid) continue;
      if (!message.readBy?.includes(currentUser.uid)) {
        return message.id;
      }
    }
    return null;
  }, [messages, currentUser]);

  // 既読書き込みとカウントリセット
  const processedReadIdsRef = useRef<Set<string>>(new Set());
  const currentRoomIdRef = useRef<string | null>(null);

  const updateReadState = useCallback(async (targetRoomId: string, uid: string) => {
    await setDoc(
      doc(db, 'chatRooms', targetRoomId, 'readStates', uid),
      { lastReadAt: serverTimestamp() },
      { merge: true },
    );
  }, []);

  useEffect(() => {
    // ルーム切り替え時に処理済みセットをリセット
    if (currentRoomIdRef.current !== roomId) {
      processedReadIdsRef.current.clear();
      currentRoomIdRef.current = roomId || null;
    }

    if (!currentUser || !roomId) return;

    if (messages.length === 0) {
      updateReadState(roomId, currentUser.uid).catch((error) => {
        console.error('既読状態更新エラー:', error);
      });
      return;
    }

    const unreadMessages = messages.filter(
      (msg) =>
        msg.senderId !== currentUser.uid &&
        !msg.readBy?.includes(currentUser.uid) &&
        !processedReadIdsRef.current.has(msg.id)
    );

    if (unreadMessages.length === 0) {
      updateReadState(roomId, currentUser.uid).catch((error) => {
        console.error('既読状態更新エラー:', error);
      });
      return;
    }

    const markAsRead = async () => {
      const batch = writeBatch(db);

      for (const msg of unreadMessages) {
        // 処理済みとして先にマーク（重複防止）
        processedReadIdsRef.current.add(msg.id);
        const msgRef = doc(db, 'chatRooms', roomId, 'messages', msg.id);
        batch.update(msgRef, {
          readBy: arrayUnion(currentUser.uid),
        });
      }

      try {
        await batch.commit();
        await updateReadState(roomId, currentUser.uid);
      } catch (error) {
        // 失敗時は処理済みから外して再試行可能にする
        unreadMessages.forEach((msg) => processedReadIdsRef.current.delete(msg.id));
        console.error('既読処理エラー:', error);
      }
    };

    markAsRead();
  }, [messages, currentUser, roomId, updateReadState]);

  return { getFirstUnreadMessageId };
}
