// グローバル通知監視フック
// 全チャットルームの新着メッセージを監視して通知を送信
// 注意: PWA環境ではService Worker (firebase-messaging-sw.js) が通知を担当するため、
//       このフックはElectron環境でのみ通知を表示する

import { useEffect, useRef } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useActiveRoom } from '../contexts/ActiveRoomContext';
import { useElectronNotification } from './useElectronNotification';
import { useRoomNotificationSettings } from './useRoomNotificationSettings';

interface LastMessageInfo {
  id: string;
  timestamp: Date;
}

export function useGlobalNotification() {
  const { currentUser } = useAuth();
  const { showNotification, isElectron, settings: electronSettings } = useElectronNotification();
  const { activeRoomId } = useActiveRoom();
  const { isRoomMuted } = useRoomNotificationSettings();
  const lastMessagesRef = useRef<Map<string, LastMessageInfo>>(new Map());
  // ルームごとの「初回スナップショット受信済みか」。全ルーム共通のフラグ＋遅延タイマー
  // だと、後から購読が増えたルームの既存メッセージや起動直後の新着を誤判定する
  const initializedRoomsRef = useRef<Set<string>>(new Set());
  const showNotificationRef = useRef(showNotification);
  const activeRoomIdRef = useRef(activeRoomId);
  const isRoomMutedRef = useRef(isRoomMuted);
  const electronSettingsRef = useRef(electronSettings);
  const messageUnsubscribersRef = useRef<Map<string, () => void>>(new Map());
  const roomNamesRef = useRef<Map<string, string>>(new Map());

  // showNotificationの最新版を常に保持
  useEffect(() => {
    showNotificationRef.current = showNotification;
  }, [showNotification]);

  // activeRoomIdの最新版を常に保持
  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);

  // isRoomMutedの最新版を常に保持
  useEffect(() => {
    isRoomMutedRef.current = isRoomMuted;
  }, [isRoomMuted]);

  // electronSettingsの最新版を常に保持
  useEffect(() => {
    electronSettingsRef.current = electronSettings;
  }, [electronSettings]);

  useEffect(() => {
    if (!currentUser) return;
    const messageUnsubscribers = messageUnsubscribersRef.current;
    const lastMessages = lastMessagesRef.current;
    const initializedRooms = initializedRoomsRef.current;

    // PWA環境（非Electron）ではService Workerが通知を担当するため、
    // このフックでは通知を表示しない
    const shouldShowNotification = isElectron;

    // Electron環境でなければ、Firestoreリスナーのみ設定して通知は表示しない
    if (!shouldShowNotification) {
      console.log('[useGlobalNotification] PWA環境のため通知はService Workerに委譲');
    }

    // ユーザーが参加しているチャットルームを取得
    const roomsQuery = query(
      collection(db, 'chatRooms'),
      where('members', 'array-contains', currentUser.uid)
    );

    const unsubscribeRooms = onSnapshot(roomsQuery, (roomsSnapshot) => {
      const roomIds: string[] = [];
      const roomNames: Map<string, string> = new Map();

      roomsSnapshot.forEach((doc) => {
        roomIds.push(doc.id);
        const data = doc.data();
        // グループ名またはメンバー名を取得
        let roomName = data.name || 'チャット';
        if (data.type === 'direct' && data.memberDetails) {
          // 1対1チャットの場合、memberDetails から相手の表示名を取得
          const other = Object.entries(data.memberDetails as Record<string, { displayName?: string }>)
            .find(([uid]) => uid !== currentUser.uid)?.[1];
          if (other?.displayName) roomName = other.displayName;
        }
        roomNames.set(doc.id, roomName);
      });
      roomNamesRef.current = roomNames;

      const activeRoomIds = new Set(roomIds);
      messageUnsubscribers.forEach((unsubscribe, roomId) => {
        if (!activeRoomIds.has(roomId)) {
          unsubscribe();
          messageUnsubscribers.delete(roomId);
          lastMessages.delete(roomId);
          initializedRooms.delete(roomId);
        }
      });

      roomIds.forEach((roomId) => {
        if (messageUnsubscribers.has(roomId)) return;

        const messagesQuery = query(
          collection(db, 'chatRooms', roomId, 'messages'),
          orderBy('createdAt', 'desc'),
          limit(1)
        );

        const unsubscribe = onSnapshot(messagesQuery, (messagesSnapshot) => {
          // このルームの初回スナップショットは既存メッセージの読み込みなので通知しない
          const isFirstSnapshot = !initializedRooms.has(roomId);
          initializedRooms.add(roomId);

          if (messagesSnapshot.empty) return;

          const doc = messagesSnapshot.docs[0];
          const data = doc.data();
          const messageId = doc.id;
          const createdAt = data.createdAt?.toDate() || new Date();
          const senderId = data.senderId;
          const senderName = data.senderName || '不明';
          const text = data.text || '画像/ファイルを送信しました';

          // 自分のメッセージは無視
          if (senderId === currentUser.uid) {
            lastMessagesRef.current.set(roomId, { id: messageId, timestamp: createdAt });
            return;
          }

          // 前回の最新メッセージと比較
          const lastMessage = lastMessagesRef.current.get(roomId);

          if (isFirstSnapshot) {
            lastMessagesRef.current.set(roomId, { id: messageId, timestamp: createdAt });
            return;
          }

          // 新しいメッセージがあれば通知（Electron環境のみ）
          if (!lastMessage || lastMessage.id !== messageId) {
            // メッセージが新しいかチェック（5秒以内に作成されたもの）
            const now = new Date();
            const messageAge = now.getTime() - createdAt.getTime();
            if (messageAge < 5000 && shouldShowNotification) {
              // 現在閲覧中のルームからのメッセージは通知しない
              if (activeRoomIdRef.current === roomId && !electronSettingsRef.current.notifyActiveRoom) {
                console.log('[useGlobalNotification] 閲覧中のルームのため通知をスキップ:', roomId);
              } else if (isRoomMutedRef.current(roomId)) {
                // ミュートされているルームからのメッセージは通知しない
                console.log('[useGlobalNotification] ミュート中のルームのため通知をスキップ:', roomId);
              } else {
                const roomName = roomNamesRef.current.get(roomId) || 'チャット';
                console.log('[useGlobalNotification] Electron通知:', roomName, senderName, text);
                // refを通じて最新のshowNotificationを呼び出す
                showNotificationRef.current(
                  `${senderName} (${roomName})`,
                  text,
                  messageId,
                  roomId  // roomIdを追加して通知から直接ルームに遷移できるようにする
                );
              }
            }
          }

          lastMessagesRef.current.set(roomId, { id: messageId, timestamp: createdAt });
        });

        messageUnsubscribers.set(roomId, unsubscribe);
      });
    });

    return () => {
      unsubscribeRooms();
      messageUnsubscribers.forEach((unsubscribe) => unsubscribe());
      messageUnsubscribers.clear();
      lastMessages.clear();
      initializedRooms.clear();
    };
  }, [currentUser, isElectron]); // showNotificationはrefを通じて呼び出すため依存配列から削除
}
