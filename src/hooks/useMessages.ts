// チャットルームのメッセージ購読・ページネーション・スクロール監視を担当する hook
//
// 役割:
// - 指定ルームの最新 50 件を Firestore から onSnapshot 購読
// - 上端スクロール時に追加読み込み（50 件単位）
// - ルーム切り替え時の購読クリーンアップ
// - 楽観的更新（H-2）: ローカル状態の `pendingMessages` で送信中メッセージを管理
//   ローカル ID（`local-` 接頭辞）と Firestore ID は別空間。重複表示しないよう
//   `confirmOptimistic` で local 側を消す。

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  startAfter,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ExtendedMessage } from '../types';
import { captureMessageAnchor, restoreMessageAnchor, type MessageScrollAnchor } from '../lib/chat/messageScroll';

const PAGE_SIZE = 50;

function getMessageTime(message: ExtendedMessage): number {
  return message.createdAt instanceof Date ? message.createdAt.getTime() : 0;
}

function mergeMessagesById(...messageGroups: ExtendedMessage[][]): ExtendedMessage[] {
  const merged = new Map<string, ExtendedMessage>();

  messageGroups.flat().forEach((message) => {
    merged.set(message.id, {
      ...merged.get(message.id),
      ...message,
    });
  });

  return Array.from(merged.values()).sort((a, b) => getMessageTime(a) - getMessageTime(b));
}

export function useMessages(roomId: string | undefined) {
  const [liveMessages, setLiveMessages] = useState<ExtendedMessage[]>([]);
  const [olderMessages, setOlderMessages] = useState<ExtendedMessage[]>([]);
  const [pendingMessages, setPendingMessages] = useState<ExtendedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [oldestMessageDate, setOldestMessageDate] = useState<Timestamp | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const olderMessagesRef = useRef<ExtendedMessage[]>([]);
  const generationRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const historyAnchorRef = useRef<MessageScrollAnchor | null>(null);

  useLayoutEffect(() => {
    const anchor = historyAnchorRef.current;
    historyAnchorRef.current = null;
    if (anchor && messageListRef.current) restoreMessageAnchor(messageListRef.current, anchor);
  }, [olderMessages]);

  useEffect(() => {
    olderMessagesRef.current = olderMessages;
  }, [olderMessages]);

  // ルーム切替時に pending をクリア（前のルームの送信中メッセージを引きずらない）
  useEffect(() => {
    generationRef.current += 1;
    loadingMoreRef.current = false;
    historyAnchorRef.current = null;
    setLoadingMore(false);
    setPendingMessages([]);
    setOlderMessages([]);
    setLiveMessages([]);
  }, [roomId]);

  const serverMessages = useMemo(
    () => mergeMessagesById(olderMessages, liveMessages),
    [olderMessages, liveMessages],
  );

  // サーバ側 + ローカル送信中をマージして表示用 messages を作る
  const messages = useMemo<ExtendedMessage[]>(() => {
    if (pendingMessages.length === 0) return serverMessages;
    // pending は常に末尾に追加（時系列で最新）
    return [...serverMessages, ...pendingMessages];
  }, [serverMessages, pendingMessages]);

  useEffect(() => {
    if (!roomId) return;
    const generation = generationRef.current;

    // ページネーションの状態をリセット
    setHasMoreMessages(true);
    setOldestMessageDate(null);
    setLoading(true);

    const q = query(
      collection(db, 'chatRooms', roomId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (generation !== generationRef.current) return;
      const msgs: ExtendedMessage[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        msgs.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate(),
        } as ExtendedMessage);
      });

      // 時系列順に戻す（古い→新しい）
      msgs.reverse();
      setLiveMessages(msgs);
      setLoading(false);

      // 最も古いメッセージの日時を保存（追加読み込み用）
      if (olderMessagesRef.current.length === 0 && msgs.length > 0 && msgs[0].createdAt) {
        setOldestMessageDate(Timestamp.fromDate(msgs[0].createdAt));
      }
      setHasMoreMessages(snapshot.size === PAGE_SIZE);
    });

    return () => unsubscribe();
  }, [roomId]);

  // -------- 楽観的更新 API（H-2） --------

  // 送信中メッセージを画面に追加し、ローカル ID を返す
  const addOptimistic = useCallback((message: Omit<ExtendedMessage, 'id' | '_pending'>): string => {
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setPendingMessages((prev) => [
      ...prev,
      { ...message, id: localId, _pending: 'sending' },
    ]);
    return localId;
  }, []);

  // 送信成功: ローカル側を一覧から除去（onSnapshot で Firestore 版が入ってくる）
  const confirmOptimistic = useCallback((localId: string) => {
    setPendingMessages((prev) => prev.filter((m) => m.id !== localId));
  }, []);

  // 送信失敗: 状態を 'failed' に切替（UI で再送導線を出す）
  const failOptimistic = useCallback((localId: string) => {
    setPendingMessages((prev) =>
      prev.map((m) => (m.id === localId ? { ...m, _pending: 'failed' } : m)),
    );
  }, []);

  // 失敗メッセージを手動で破棄
  const dismissOptimistic = useCallback((localId: string) => {
    setPendingMessages((prev) => prev.filter((m) => m.id !== localId));
  }, []);

  // 過去のメッセージを追加読み込み
  const loadMoreMessages = useCallback(async () => {
    if (!roomId || !oldestMessageDate || loadingMoreRef.current || !hasMoreMessages) return;

    const targetRoomId = roomId;
    const generation = generationRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, 'chatRooms', targetRoomId, 'messages'),
        orderBy('createdAt', 'desc'),
        startAfter(oldestMessageDate),
        limit(PAGE_SIZE)
      );

      const snapshot = await getDocs(q);
      if (generation !== generationRef.current) return;
      const olderMsgs: ExtendedMessage[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        olderMsgs.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate(),
        } as ExtendedMessage);
      });

      olderMsgs.reverse();
      // 通信中のスクロールも尊重し、追加を描画する直前の閲覧位置を保存する。
      historyAnchorRef.current = messageListRef.current
        ? captureMessageAnchor(messageListRef.current) : null;
      setOlderMessages((prev) => mergeMessagesById(olderMsgs, prev));

      if (olderMsgs.length > 0 && olderMsgs[0].createdAt) {
        setOldestMessageDate(Timestamp.fromDate(olderMsgs[0].createdAt));
      }
      setHasMoreMessages(snapshot.size === PAGE_SIZE);
    } catch (error) {
      console.error('追加読み込みエラー:', error);
    } finally {
      if (generation === generationRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [roomId, oldestMessageDate, hasMoreMessages]);

  // スクロール位置を監視して上端で追加読み込み
  const handleScroll = useCallback(() => {
    if (messageListRef.current?.scrollTop === 0 && hasMoreMessages && !loadingMore) {
      loadMoreMessages();
    }
  }, [hasMoreMessages, loadingMore, loadMoreMessages]);

  return {
    messages,
    loading,
    hasMoreMessages,
    loadingMore,
    loadMoreMessages,
    handleScroll,
    messageListRef,
    // 楽観的更新 API
    addOptimistic,
    confirmOptimistic,
    failOptimistic,
    dismissOptimistic,
  };
}
