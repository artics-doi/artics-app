// ログイン中ユーザーが所属するチャットルーム一覧の購読を担当する hook
//
// 役割:
// - chatRooms から members に currentUser.uid を含むルームを onSnapshot 購読
// - クライアント側でお気に入り優先 → 更新日時降順でソート
// - 既存ユーザーがメモルームを持たない場合は自動で作成

import { useEffect, useRef, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ChatRoom } from '../types';

export function useChatRooms(currentUser: FirebaseUser | null) {
  const currentUserId = currentUser?.uid ?? null;
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUserId) return;

    // インデックス不要のシンプルなクエリ
    const q = query(
      collection(db, 'chatRooms'),
      where('members', 'array-contains', currentUserId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rooms: ChatRoom[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          rooms.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate(),
            updatedAt: data.updatedAt?.toDate(),
            lastMessage: data.lastMessage
              ? {
                  ...data.lastMessage,
                  timestamp: data.lastMessage.timestamp?.toDate(),
                }
              : null,
          } as ChatRoom);
        });
        // クライアント側ソート: お気に入り優先 → 更新日時降順
        rooms.sort((a, b) => {
          const aFav = a.favorites?.includes(currentUserId) ? 1 : 0;
          const bFav = b.favorites?.includes(currentUserId) ? 1 : 0;
          if (aFav !== bFav) return bFav - aFav;
          const timeA = a.updatedAt?.getTime() || 0;
          const timeB = b.updatedAt?.getTime() || 0;
          return timeB - timeA;
        });
        setChatRooms(rooms);
        setLoading(false);
      },
      (error) => {
        console.error('チャットルーム取得エラー:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUserId]);

  // 既存ユーザー向け: メモルームがなければ自動作成
  const memoCreatedRef = useRef(false);
  const memoCreatedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentUserId = currentUser?.uid ?? null;
    if (memoCreatedUserIdRef.current !== currentUserId) {
      memoCreatedRef.current = false;
      memoCreatedUserIdRef.current = currentUserId;
    }

    if (!currentUser || loading || memoCreatedRef.current) return;
    const hasMemo = chatRooms.some((r) => r.type === 'memo');
    if (hasMemo) return;
    memoCreatedRef.current = true;

    setDoc(doc(db, 'chatRooms', `memo_${currentUser.uid}`), {
      name: 'メモ',
      type: 'memo',
      members: [currentUser.uid],
      memberDetails: {
        [currentUser.uid]: {
          displayName: currentUser.displayName || 'Unknown',
          photoURL: currentUser.photoURL,
        },
      },
      lastMessage: null,
      unreadCounts: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch((err) => console.error('メモルーム作成エラー:', err));
  }, [currentUser, loading, chatRooms]);

  return { chatRooms, loading };
}
