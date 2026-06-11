// 未読カウント計算ヘルパー。index.ts から機械的に移動（挙動変更なし）。

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// lastReadAt 以降の「他人からの未削除メッセージ」件数を数える。
// メッセージ作成時と readStates 書き込み時の両方がこの同じ計算式で
// 絶対値を書くことで、増分方式と絶対値方式の併存による未読数のずれを防ぐ
export async function computeUnreadCount(
  roomRef: admin.firestore.DocumentReference,
  userId: string,
  lastReadAt: Timestamp | null
): Promise<number> {
  let messagesQuery: admin.firestore.Query = roomRef.collection('messages');
  if (lastReadAt) {
    messagesQuery = messagesQuery.where('createdAt', '>', lastReadAt);
  }
  const messagesSnapshot = await messagesQuery.get();
  return messagesSnapshot.docs.filter((messageDoc) => {
    const message = messageDoc.data();
    return message.senderId !== userId && message.isDeleted !== true;
  }).length;
}
