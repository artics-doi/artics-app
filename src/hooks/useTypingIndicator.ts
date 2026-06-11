import { useCallback, useEffect, useRef } from 'react';
import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// M-28: タイピング状態の維持タイムアウトを 5 秒 → 10 秒に延長。
// 入力途中で短い間を置いてもタイピング表示が消えず、ユーザーの「相手が入力中」体験を改善する。
// `setTyping` は呼ばれるたびに `clearTimer()` でタイマーを再セットするためリセット動作は元から実装済み。
export const TYPING_TIMEOUT = 10000;

export function useTypingIndicator(roomId?: string, currentUserUid?: string) {
  const isTypingRef = useRef(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const clearTyping = useCallback(async () => {
    clearTimer();

    if (!roomId || !currentUserUid) {
      isTypingRef.current = false;
      return;
    }

    try {
      await updateDoc(doc(db, 'chatRooms', roomId), {
        [`typing.${currentUserUid}`]: deleteField()
      });
    } catch (error) {
      console.error('[useTypingIndicator] clearTypingエラー:', error);
    } finally {
      isTypingRef.current = false;
    }
  }, [clearTimer, currentUserUid, roomId]);

  const setTyping = useCallback(async () => {
    if (!roomId || !currentUserUid) return;

    clearTimer();

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      try {
        await updateDoc(doc(db, 'chatRooms', roomId), {
          [`typing.${currentUserUid}`]: serverTimestamp()
        });
      } catch (error) {
        isTypingRef.current = false;
        console.error('[useTypingIndicator] setTypingエラー:', error);
        return;
      }
    }

    clearTimerRef.current = setTimeout(() => {
      void clearTyping();
    }, TYPING_TIMEOUT);
  }, [clearTimer, clearTyping, currentUserUid, roomId]);

  useEffect(() => {
    return () => {
      void clearTyping();
    };
  }, [clearTyping]);

  return {
    setTyping,
    clearTyping
  };
}
