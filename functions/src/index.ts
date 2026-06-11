import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

function getTrackedFileSize(data: admin.firestore.DocumentData | undefined): number {
  if (!data?.storagePath || typeof data.fileSize !== 'number') return 0;
  return data.fileSize;
}

function getTrackedPhotoFileSize(data: admin.firestore.DocumentData | undefined): number {
  if (!data?.photoStoragePath || typeof data.photoFileSize !== 'number') return 0;
  return data.photoFileSize;
}

async function adjustStorageUsage(deltaBytes: number): Promise<void> {
  if (deltaBytes === 0) return;

  await db.collection('settings').doc('storageUsage').set({
    totalBytes: FieldValue.increment(deltaBytes),
    lastUpdated: FieldValue.serverTimestamp()
  }, { merge: true });
}

function isInvalidRegistrationToken(error: admin.FirebaseError | undefined): boolean {
  return error?.code === 'messaging/registration-token-not-registered' ||
    error?.code === 'messaging/invalid-registration-token' ||
    error?.code === 'messaging/invalid-argument';
}

type ScheduleNotificationTiming =
  | 'atStart'
  | 'fiveMinutesBefore'
  | 'fifteenMinutesBefore'
  | 'thirtyMinutesBefore'
  | 'oneHourBefore'
  | 'previousDayEvening'
  | 'sameDayMorning'
  | 'custom';

interface ScheduleData {
  title?: string;
  categoryId?: string;
  targetUserIds?: string[];
  targetUserNames?: string[];
  startAt?: Timestamp;
  endAt?: Timestamp | null;
  allDay?: boolean;
  createdBy?: string;
  notification?: {
    enabled?: boolean;
    timings?: ScheduleNotificationTiming[];
    customAt?: Timestamp | null;
  };
  sentNotificationKeys?: string[];
}

const SCHEDULE_NOTIFICATION_GRACE_MS = 2 * 60 * 1000;

function withTime(date: Date, hours: number, minutes: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

function getScheduleNotificationTime(schedule: ScheduleData, timing: ScheduleNotificationTiming): Date | null {
  const startAt = schedule.startAt?.toDate();
  if (!startAt) return null;
  if (timing === 'custom') return schedule.notification?.customAt?.toDate() ?? null;

  if (schedule.allDay !== false) {
    const startDay = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate());
    if (timing === 'previousDayEvening') {
      const previousDay = new Date(startDay);
      previousDay.setDate(previousDay.getDate() - 1);
      return withTime(previousDay, 17, 0);
    }
    return withTime(startDay, 8, 30);
  }

  switch (timing) {
    case 'atStart':
      return startAt;
    case 'fiveMinutesBefore':
      return new Date(startAt.getTime() - 5 * 60 * 1000);
    case 'fifteenMinutesBefore':
      return new Date(startAt.getTime() - 15 * 60 * 1000);
    case 'thirtyMinutesBefore':
      return new Date(startAt.getTime() - 30 * 60 * 1000);
    case 'oneHourBefore':
      return new Date(startAt.getTime() - 60 * 60 * 1000);
    case 'previousDayEvening': {
      const previousDay = new Date(startAt);
      previousDay.setDate(previousDay.getDate() - 1);
      return withTime(previousDay, 17, 0);
    }
    case 'sameDayMorning':
      return withTime(startAt, 8, 30);
    default:
      return null;
  }
}

async function getFcmTokensForUsers(userIds: string[]): Promise<{ tokens: string[]; tokenOwners: Map<string, Set<string>> }> {
  const tokens: string[] = [];
  const tokenOwners = new Map<string, Set<string>>();

  for (const userId of userIds) {
    const tokensSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('fcmTokens')
      .get();

    tokensSnapshot.docs.forEach((doc) => {
      const token = doc.data().token;
      if (!token) return;
      if (!tokens.includes(token)) tokens.push(token);
      const owners = tokenOwners.get(token) ?? new Set<string>();
      owners.add(userId);
      tokenOwners.set(token, owners);
    });
  }

  return { tokens, tokenOwners };
}

async function deleteInvalidTokens(invalidTokens: string[], tokenOwners: Map<string, Set<string>>): Promise<void> {
  for (const invalidToken of invalidTokens) {
    const owners = tokenOwners.get(invalidToken) ?? new Set<string>();
    for (const userId of owners) {
      await db
        .collection('users')
        .doc(userId)
        .collection('fcmTokens')
        .doc(invalidToken)
        .delete();
      console.log(`Deleted invalid token for user ${userId}`);
    }
  }
}

// メッセージ作成時に未読カウントを更新
export const updateUnreadCountsOnNewMessage = onDocumentCreated(
  'chatRooms/{chatRoomId}/messages/{messageId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log('No data associated with the event');
      return;
    }

    const message = snapshot.data();
    const chatRoomId = event.params.chatRoomId;
    const senderId = message.senderId;

    // チャットルーム情報を取得
    const roomRef = db.collection('chatRooms').doc(chatRoomId);
    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) {
      console.log('Chat room not found');
      return;
    }

    const roomData = roomDoc.data();
    if (!roomData) return;

    const members: string[] = roomData.members || [];

    const createdAt = message.createdAt instanceof Timestamp ? message.createdAt : null;

    // 送信者以外の未読数を+1。ただし、Functions 実行時点ですでに readStates が進んでいるユーザーは増やさない。
    const updateData: { [key: string]: FieldValue } = {};
    await Promise.all(members.map(async (memberId) => {
      if (memberId === senderId) return;

      const readStateDoc = await roomRef.collection('readStates').doc(memberId).get();
      const lastReadAt = readStateDoc.data()?.lastReadAt;
      const alreadyRead = createdAt &&
        lastReadAt instanceof Timestamp &&
        lastReadAt.toMillis() >= createdAt.toMillis();

      if (!alreadyRead) {
        updateData[`unreadCounts.${memberId}`] = FieldValue.increment(1);
      }
    }));

    if (Object.keys(updateData).length > 0) {
      try {
        await roomRef.update(updateData);
        console.log(`Updated unread counts for room ${chatRoomId}`);
      } catch (error) {
        console.error('Error updating unread counts:', error);
      }
    }
  }
);

// メッセージ作成時にプッシュ通知を送信
export const sendPushNotificationOnNewMessage = onDocumentCreated(
  'chatRooms/{chatRoomId}/messages/{messageId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log('No data associated with the event');
      return;
    }

    const message = snapshot.data();
    const chatRoomId = event.params.chatRoomId;
    const senderId = message.senderId;
    const senderName = message.senderName || '不明なユーザー';
    const messageText = message.text || '';

    console.log(`New message in room ${chatRoomId} from ${senderName}`);

    // チャットルーム情報を取得
    const chatRoomDoc = await db.collection('chatRooms').doc(chatRoomId).get();
    if (!chatRoomDoc.exists) {
      console.log('Chat room not found');
      return;
    }

    const chatRoom = chatRoomDoc.data();
    if (!chatRoom) return;

    const roomName = chatRoom.name || 'チャットルーム';
    // フロントエンドでは 'members' フィールドを使用
    const memberIds: string[] = chatRoom.members || [];

    console.log(`Room: ${roomName}, members: ${JSON.stringify(memberIds)}, senderId: ${senderId}`);

    // 送信者以外の全メンバーに通知を送信
    const recipientIds = memberIds.filter((id: string) => id !== senderId);

    console.log(`Recipients: ${JSON.stringify(recipientIds)}`);

    if (recipientIds.length === 0) {
      console.log('No recipients to notify (memberIds might not include other members)');
      return;
    }

    // 各受信者のFCMトークンを取得（ミュート設定を考慮）
    const tokens: string[] = [];
    const tokenOwners = new Map<string, Set<string>>();
    for (const userId of recipientIds) {
      // ミュート設定を確認
      const muteSettingDoc = await db
        .collection('users')
        .doc(userId)
        .collection('notificationSettings')
        .doc(chatRoomId)
        .get();

      if (muteSettingDoc.exists && muteSettingDoc.data()?.muted === true) {
        console.log(`User ${userId} has muted room ${chatRoomId}, skipping notification`);
        continue;
      }

      console.log(`Fetching FCM tokens for user: ${userId}`);
      const tokensSnapshot = await db
        .collection('users')
        .doc(userId)
        .collection('fcmTokens')
        .get();

      console.log(`Found ${tokensSnapshot.docs.length} tokens for user ${userId}`);
      tokensSnapshot.docs.forEach((doc) => {
        const tokenData = doc.data();
        if (tokenData.token) {
          if (!tokens.includes(tokenData.token)) {
            tokens.push(tokenData.token);
          }
          const owners = tokenOwners.get(tokenData.token) ?? new Set<string>();
          owners.add(userId);
          tokenOwners.set(tokenData.token, owners);
          console.log(`Added token: ${tokenData.token.substring(0, 20)}...`);
        }
      });
    }

    if (tokens.length === 0) {
      console.log('No FCM tokens found for recipients');
      return;
    }

    console.log(`Sending notification to ${tokens.length} tokens`);

    // 通知メッセージを構築
    let bodyText = messageText;
    if (message.imageURL) {
      bodyText = '画像を送信しました';
    } else if (message.fileURL) {
      bodyText = 'ファイルを送信しました';
    }

    // Web Push用のペイロード構築
    // Service Workerで通知を表示するため、dataフィールドにカスタムデータを含める
    // webpush.headersでTTLとUrgencyを設定し、FCMのデフォルト動作を制御
    const notificationPayload: admin.messaging.MulticastMessage = {
      tokens,
      data: {
        title: roomName,
        body: `${senderName}: ${bodyText}`,
        chatRoomId,
        messageId: event.params.messageId,
        url: `/#/chat/${chatRoomId}`
      },
      // Web Push固有の設定
      webpush: {
        headers: {
          TTL: '86400',  // 24時間
          Urgency: 'high'
        },
        // FCMContentAvailableをfalseにしてサイレント通知を防ぐ
        fcmOptions: {
          link: `/#/chat/${chatRoomId}`
        }
      },
      // Android用設定（PWAがAndroidで動作する場合）
      android: {
        priority: 'high',
        // notificationフィールドを含めない = Service Workerが処理
      }
    };

    try {
      const response = await messaging.sendEachForMulticast(notificationPayload);
      console.log(`Successfully sent ${response.successCount} messages`);

      // 失敗したトークンを削除
      if (response.failureCount > 0) {
        const invalidTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.log(`Failed to send to token: ${tokens[idx]}`, resp.error);
            if (isInvalidRegistrationToken(resp.error)) {
              invalidTokens.push(tokens[idx]);
            }
          }
        });

        for (const invalidToken of invalidTokens) {
          const owners = tokenOwners.get(invalidToken) ?? new Set<string>();
          for (const userId of owners) {
            await db
              .collection('users')
              .doc(userId)
              .collection('fcmTokens')
              .doc(invalidToken)
              .delete();
            console.log(`Deleted invalid token for user ${userId}`);
          }
        }
      }
    } catch (error) {
      console.error('Error sending notifications:', error);
    }
  }
);

export const sendScheduleNotifications = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'Asia/Tokyo',
  },
  async () => {
    const now = Date.now();
    const schedulesSnapshot = await db
      .collection('schedules')
      .where('notification.enabled', '==', true)
      .get();

    for (const scheduleDoc of schedulesSnapshot.docs) {
      const schedule = scheduleDoc.data() as ScheduleData;
      const timings = schedule.notification?.timings ?? [];
      if (timings.length === 0) continue;

      const sentKeys = new Set(schedule.sentNotificationKeys ?? []);
      const recipientIds = schedule.targetUserIds && schedule.targetUserIds.length > 0
        ? schedule.targetUserIds
        : schedule.createdBy
          ? [schedule.createdBy]
          : [];

      if (recipientIds.length === 0) continue;

      for (const timing of timings) {
        const notifyAt = getScheduleNotificationTime(schedule, timing);
        if (!notifyAt) continue;

        const notifyAtMs = notifyAt.getTime();
        if (notifyAtMs > now || notifyAtMs < now - SCHEDULE_NOTIFICATION_GRACE_MS) continue;

        const notificationKey = `${scheduleDoc.id}:${timing}:${notifyAtMs}`;
        if (sentKeys.has(notificationKey)) continue;

        const { tokens, tokenOwners } = await getFcmTokensForUsers(recipientIds);
        if (tokens.length === 0) {
          console.log(`No FCM tokens found for schedule ${scheduleDoc.id}`);
          await scheduleDoc.ref.update({
            sentNotificationKeys: FieldValue.arrayUnion(notificationKey),
            updatedAt: FieldValue.serverTimestamp()
          });
          continue;
        }

        const targetUsers = schedule.targetUserNames?.length
          ? ` / ${schedule.targetUserNames.join('、')}`
          : '';
        const notificationPayload: admin.messaging.MulticastMessage = {
          tokens,
          data: {
            title: '行動予定表',
            body: `${schedule.title || '予定'}${targetUsers}`,
            scheduleId: scheduleDoc.id,
            scheduleNotificationId: notificationKey,
            url: '/#/schedule'
          },
          webpush: {
            headers: {
              TTL: '86400',
              Urgency: 'high'
            },
            fcmOptions: {
              link: '/#/schedule'
            }
          },
          android: {
            priority: 'high'
          }
        };

        try {
          const response = await messaging.sendEachForMulticast(notificationPayload);
          console.log(`Schedule ${scheduleDoc.id}: sent ${response.successCount} notifications`);

          const invalidTokens: string[] = [];
          response.responses.forEach((resp, index) => {
            if (!resp.success && isInvalidRegistrationToken(resp.error)) {
              invalidTokens.push(tokens[index]);
            }
          });
          await deleteInvalidTokens(invalidTokens, tokenOwners);

          await scheduleDoc.ref.update({
            sentNotificationKeys: FieldValue.arrayUnion(notificationKey),
            updatedAt: FieldValue.serverTimestamp()
          });
        } catch (error) {
          console.error(`Error sending schedule notification ${scheduleDoc.id}:`, error);
        }
      }
    }
  }
);

// readStates の lastReadAt から unreadCounts を正規化
export const normalizeUnreadCountOnReadStateWrite = onDocumentWritten(
  'chatRooms/{chatRoomId}/readStates/{userId}',
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const { chatRoomId, userId } = event.params;
    const lastReadAt = after.data()?.lastReadAt;
    if (!(lastReadAt instanceof Timestamp)) return;

    const roomRef = db.collection('chatRooms').doc(chatRoomId);
    const messagesSnapshot = await roomRef
      .collection('messages')
      .where('createdAt', '>', lastReadAt)
      .get();

    const unreadCount = messagesSnapshot.docs.filter((messageDoc) => {
      const message = messageDoc.data();
      return message.senderId !== userId && message.isDeleted !== true;
    }).length;

    await roomRef.update({
      [`unreadCounts.${userId}`]: unreadCount
    });
  }
);

// メッセージ添付の fileSize 差分を storageUsage に反映
export const updateStorageUsageOnMessageWrite = onDocumentWritten(
  'chatRooms/{chatRoomId}/messages/{messageId}',
  async (event) => {
    const beforeSize = getTrackedFileSize(event.data?.before.data());
    const afterSize = getTrackedFileSize(event.data?.after.data());
    await adjustStorageUsage(afterSize - beforeSize);
  }
);

// プロフィール画像の fileSize 差分を storageUsage に反映
export const updateStorageUsageOnUserWrite = onDocumentWritten(
  'users/{userId}',
  async (event) => {
    const beforeSize = getTrackedPhotoFileSize(event.data?.before.data());
    const afterSize = getTrackedPhotoFileSize(event.data?.after.data());
    await adjustStorageUsage(afterSize - beforeSize);
  }
);

// グループ画像の fileSize 差分を storageUsage に反映
export const updateStorageUsageOnRoomWrite = onDocumentWritten(
  'chatRooms/{chatRoomId}',
  async (event) => {
    const beforeSize = getTrackedPhotoFileSize(event.data?.before.data());
    const afterSize = getTrackedPhotoFileSize(event.data?.after.data());
    await adjustStorageUsage(afterSize - beforeSize);
  }
);

// ユーザープロフィール更新時に各チャットルームのmemberDetailsを同期
export const syncMemberDetailsOnProfileUpdate = onDocumentUpdated(
  'users/{userId}',
  async (event) => {
    const change = event.data;
    if (!change) {
      console.log('No data associated with the event');
      return;
    }

    const userId = event.params.userId;
    const beforeData = change.before.data();
    const afterData = change.after.data();

    if (!beforeData || !afterData) {
      console.log(`Missing before/after data for user ${userId}`);
      return;
    }

    const beforeDisplayName = typeof beforeData.displayName === 'string' ? beforeData.displayName : null;
    const afterDisplayName = typeof afterData.displayName === 'string' ? afterData.displayName : null;
    const beforePhotoURL = typeof beforeData.photoURL === 'string' ? beforeData.photoURL : null;
    const afterPhotoURL = typeof afterData.photoURL === 'string' ? afterData.photoURL : null;

    if (beforeDisplayName === afterDisplayName && beforePhotoURL === afterPhotoURL) {
      return;
    }

    const joinedRoomsSnapshot = await db
      .collection('chatRooms')
      .where('members', 'array-contains', userId)
      .get();

    if (joinedRoomsSnapshot.empty) {
      return;
    }

    const joinedRoomDocs = joinedRoomsSnapshot.docs;
    for (let i = 0; i < joinedRoomDocs.length; i += 500) {
      const batch = db.batch();
      joinedRoomDocs.slice(i, i + 500).forEach((roomDoc) => {
        batch.update(roomDoc.ref, {
          [`memberDetails.${userId}.displayName`]: afterDisplayName ?? 'Unknown',
          [`memberDetails.${userId}.photoURL`]: afterPhotoURL
        });
      });
      await batch.commit();
    }

    console.log(`Synced memberDetails for user ${userId} in ${joinedRoomsSnapshot.size} rooms`);
  }
);

// 【M0】工程管理（process management）の Cloud Functions を再エクスポートする。
// これを忘れると functions/src/process/* の関数はビルドは通るがデプロイされない。
// デプロイ後 `firebase functions:list` に onProjectUpdated が表示されることを確認。
export * from './process';
