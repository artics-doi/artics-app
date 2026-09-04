import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adjustStorageUsage, getTrackedFileSize, getTrackedPhotoFileSize } from './storageUsage';
import { deleteInvalidTokens, getFcmTokensForUsers, isInvalidRegistrationToken } from './fcm';
import { getScheduleNotificationTime, resolveScheduleRecipientIds, SCHEDULE_NOTIFICATION_GRACE_MS, type ScheduleData } from './scheduleTime';
import { claimDelivery, finishDelivery } from './notificationDelivery';

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// メッセージ作成時に未読カウントを更新
export const updateUnreadCountsOnNewMessage = onDocumentCreated(
  { document: 'chatRooms/{chatRoomId}/messages/{messageId}', retry: true },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log('No data associated with the event');
      return;
    }

    const message = snapshot.data();
    const chatRoomId = event.params.chatRoomId;
    const senderId = message.senderId;

    const roomRef = db.collection('chatRooms').doc(chatRoomId);
    const messageRef = snapshot.ref;
    await db.runTransaction(async (transaction) => {
      const [roomDoc, currentMessageDoc] = await Promise.all([
        transaction.get(roomRef),
        transaction.get(messageRef),
      ]);
      if (!roomDoc.exists || !currentMessageDoc.exists) return;

      const currentMessage = currentMessageDoc.data();
      if (!currentMessage) return;
      if (currentMessage.unreadCountApplied === true) return;

      const members: string[] = roomDoc.data()?.members || [];
      const recipientIds = members.filter((memberId) => memberId !== senderId);
      const readStateRefs = recipientIds.map((memberId) =>
        roomRef.collection('readStates').doc(memberId),
      );
      const readStateDocs = readStateRefs.length > 0
        ? await transaction.getAll(...readStateRefs)
        : [];
      const readBy = new Set<string>(currentMessage.readBy || []);
      const createdAt = currentMessage.createdAt;
      const updates: Record<string, unknown> = {};
      recipientIds.forEach((memberId, index) => {
        const lastReadAt = readStateDocs[index]?.data()?.lastReadAt;
        const wasAlreadyRead = readBy.has(memberId)
          || (createdAt instanceof Timestamp
            && lastReadAt instanceof Timestamp
            && lastReadAt.toMillis() >= createdAt.toMillis());
        if (!wasAlreadyRead) {
          updates[`unreadCounts.${memberId}`] = FieldValue.increment(1);
        }
      });
      if (Object.keys(updates).length > 0) transaction.update(roomRef, updates);
      // Eventarc の再配信でも同じメッセージを二重加算しないよう、
      // ルーム更新と同じトランザクション内で適用済みを記録する。
      transaction.update(messageRef, {
        unreadCountApplied: true,
        unreadCountAppliedAt: FieldValue.serverTimestamp(),
      });
    });
  }
);

// メッセージ作成時にプッシュ通知を送信
export const sendPushNotificationOnNewMessage = onDocumentCreated(
  { document: 'chatRooms/{chatRoomId}/messages/{messageId}', retry: true },
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
    const deliveryId = `chat_${chatRoomId}_${event.params.messageId}`;
    const claim = await claimDelivery(db, deliveryId);
    if (claim === 'already_sent' || claim === 'exhausted') return;
    if (claim === 'busy') throw new Error('notification-delivery-busy');

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
      await finishDelivery(db, deliveryId, 'sent');
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
      await finishDelivery(db, deliveryId, 'sent');
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
      await finishDelivery(db, deliveryId, 'sent');
    } catch (error) {
      console.error('Error sending notifications:', error);
      await finishDelivery(db, deliveryId, 'failed', (error as { code?: string }).code ?? 'unknown');
      throw error;
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
    // 通知が発火し得る開始日時の予定と、現在が通知時刻のカスタム通知だけを読む。
    // enabled=true の全予定を毎分読み続けると、通知済みの過去予定も永続的に課金対象になる。
    const standardWindowStart = Timestamp.fromMillis(now - 24 * 60 * 60 * 1000);
    const standardWindowEnd = Timestamp.fromMillis(now + 48 * 60 * 60 * 1000);
    const customWindowStart = Timestamp.fromMillis(now - SCHEDULE_NOTIFICATION_GRACE_MS);
    const customWindowEnd = Timestamp.fromMillis(now);
    const [standardSnapshot, customSnapshot] = await Promise.all([
      db.collection('schedules')
        .where('notification.enabled', '==', true)
        .where('startAt', '>=', standardWindowStart)
        .where('startAt', '<=', standardWindowEnd)
        .get(),
      db.collection('schedules')
        .where('notification.enabled', '==', true)
        .where('notification.customAt', '>=', customWindowStart)
        .where('notification.customAt', '<=', customWindowEnd)
        .get(),
    ]);
    const scheduleDocs = new Map(
      [...standardSnapshot.docs, ...customSnapshot.docs].map((scheduleDoc) => [scheduleDoc.id, scheduleDoc]),
    );
    let allActiveUserIdsPromise: Promise<string[]> | null = null;
    const getAllActiveUserIds = () => {
      if (!allActiveUserIdsPromise) {
        allActiveUserIdsPromise = db.collection('users').get().then((snapshot) => (
          snapshot.docs
            .filter((userDoc) => {
              const lifecycleState = userDoc.data().lifecycleState ?? 'active';
              return lifecycleState !== 'deleted' && lifecycleState !== 'disabling';
            })
            .map((userDoc) => userDoc.id)
        ));
      }
      return allActiveUserIdsPromise;
    };

    for (const scheduleDoc of scheduleDocs.values()) {
      const schedule = scheduleDoc.data() as ScheduleData;
      const timings = schedule.notification?.timings ?? [];
      if (timings.length === 0) continue;

      const sentKeys = new Set(schedule.sentNotificationKeys ?? []);
      const recipientIds = resolveScheduleRecipientIds(
        schedule,
        schedule.notification?.recipientScope === 'all' ? await getAllActiveUserIds() : [],
      );

      if (recipientIds.length === 0) continue;

      for (const timing of timings) {
        const notifyAt = getScheduleNotificationTime(schedule, timing);
        if (!notifyAt) continue;

        const notifyAtMs = notifyAt.getTime();
        if (notifyAtMs > now || notifyAtMs < now - SCHEDULE_NOTIFICATION_GRACE_MS) continue;

        const notificationKey = `${scheduleDoc.id}:${timing}:${notifyAtMs}`;
        if (sentKeys.has(notificationKey)) continue;
        const deliveryId = `schedule_${notificationKey}`;
        const claim = await claimDelivery(db, deliveryId);
        if (claim === 'already_sent' || claim === 'exhausted') continue;
        if (claim === 'busy') throw new Error('notification-delivery-busy');

        const { tokens, tokenOwners } = await getFcmTokensForUsers(db, recipientIds);
        if (tokens.length === 0) {
          console.log(`No FCM tokens found for schedule ${scheduleDoc.id}`);
          await scheduleDoc.ref.update({
            sentNotificationKeys: FieldValue.arrayUnion(notificationKey),
            updatedAt: FieldValue.serverTimestamp()
          });
          await finishDelivery(db, deliveryId, 'sent');
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
          await deleteInvalidTokens(db, invalidTokens, tokenOwners);

          await scheduleDoc.ref.update({
            sentNotificationKeys: FieldValue.arrayUnion(notificationKey),
            updatedAt: FieldValue.serverTimestamp()
          });
          await finishDelivery(db, deliveryId, 'sent');
        } catch (error) {
          console.error(`Error sending schedule notification ${scheduleDoc.id}:`, error);
          await finishDelivery(db, deliveryId, 'failed', (error as { code?: string }).code ?? 'unknown');
          throw error;
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
    const eventData = after.data();
    if (!eventData) return;
    const lastReadAt = eventData?.lastReadAt;
    if (!(lastReadAt instanceof Timestamp)) return;
    const eventVersion = typeof eventData.version === 'number' ? eventData.version : 0;

    const roomRef = db.collection('chatRooms').doc(chatRoomId);
    const readStateRef = roomRef.collection('readStates').doc(userId);
    await db.runTransaction(async (transaction) => {
      const [roomSnapshot, readStateSnapshot] = await Promise.all([
        transaction.get(roomRef),
        transaction.get(readStateRef),
      ]);
      if (!roomSnapshot.exists || !readStateSnapshot.exists) return;
      if ((readStateSnapshot.data()?.version ?? 0) !== eventVersion) return;
      const messages = await transaction.get(
        roomRef.collection('messages').where('createdAt', '>', lastReadAt),
      );
      const unreadCount = messages.docs.filter((messageDoc) => {
        const message = messageDoc.data();
        return message.senderId !== userId && message.isDeleted !== true;
      }).length;
      transaction.update(roomRef, {
        [`unreadCounts.${userId}`]: unreadCount,
        [`unreadVersions.${userId}`]: eventVersion,
      });
    });
  }
);

// メッセージ添付の fileSize 差分を storageUsage に反映
export const updateStorageUsageOnMessageWrite = onDocumentWritten(
  'chatRooms/{chatRoomId}/messages/{messageId}',
  async (event) => {
    const beforeSize = getTrackedFileSize(event.data?.before.data());
    const afterSize = getTrackedFileSize(event.data?.after.data());
    await adjustStorageUsage(db, afterSize - beforeSize);
  }
);

export const cleanupDeletingAttachment = onDocumentUpdated(
  { document: 'chatRooms/{chatRoomId}/messages/{messageId}', retry: true },
  async (event) => {
    const before = event.data?.before.data();
    const afterSnapshot = event.data?.after;
    const after = afterSnapshot?.data();
    if (!before || !after || !afterSnapshot) return;
    if (before.attachmentState === 'deleting' || after.attachmentState !== 'deleting') return;
    const storagePath = after.storagePath;
    try {
      if (typeof storagePath === 'string' && storagePath) {
        await admin.storage().bucket().file(storagePath).delete({ ignoreNotFound: true });
      }
      await afterSnapshot.ref.update({
        imageURL: null,
        fileURL: null,
        storagePath: null,
        fileSize: null,
        attachmentState: 'deleted',
        attachmentError: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      await afterSnapshot.ref.update({
        attachmentState: 'failed',
        attachmentError: (error as { code?: string }).code ?? 'attachment-delete-failed',
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw error;
    }
  },
);

// プロフィール画像の fileSize 差分を storageUsage に反映
export const updateStorageUsageOnUserWrite = onDocumentWritten(
  'users/{userId}',
  async (event) => {
    const beforeSize = getTrackedPhotoFileSize(event.data?.before.data());
    const afterSize = getTrackedPhotoFileSize(event.data?.after.data());
    await adjustStorageUsage(db, afterSize - beforeSize);
  }
);

// グループ画像の fileSize 差分を storageUsage に反映
export const updateStorageUsageOnRoomWrite = onDocumentWritten(
  'chatRooms/{chatRoomId}',
  async (event) => {
    const beforeSize = getTrackedPhotoFileSize(event.data?.before.data());
    const afterSize = getTrackedPhotoFileSize(event.data?.after.data());
    await adjustStorageUsage(db, afterSize - beforeSize);
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
export * from './userLifecycle';
export * from './roomLifecycle';
