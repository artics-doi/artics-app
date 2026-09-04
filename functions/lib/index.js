"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncMemberDetailsOnProfileUpdate = exports.updateStorageUsageOnRoomWrite = exports.updateStorageUsageOnUserWrite = exports.cleanupDeletingAttachment = exports.updateStorageUsageOnMessageWrite = exports.normalizeUnreadCountOnReadStateWrite = exports.sendScheduleNotifications = exports.sendPushNotificationOnNewMessage = exports.updateUnreadCountsOnNewMessage = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_2 = require("firebase-admin/firestore");
const storageUsage_1 = require("./storageUsage");
const fcm_1 = require("./fcm");
const scheduleTime_1 = require("./scheduleTime");
const notificationDelivery_1 = require("./notificationDelivery");
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
// メッセージ作成時に未読カウントを更新
exports.updateUnreadCountsOnNewMessage = (0, firestore_1.onDocumentCreated)({ document: 'chatRooms/{chatRoomId}/messages/{messageId}', retry: true }, async (event) => {
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
        var _a;
        const [roomDoc, currentMessageDoc] = await Promise.all([
            transaction.get(roomRef),
            transaction.get(messageRef),
        ]);
        if (!roomDoc.exists || !currentMessageDoc.exists)
            return;
        const currentMessage = currentMessageDoc.data();
        if (!currentMessage)
            return;
        if (currentMessage.unreadCountApplied === true)
            return;
        const members = ((_a = roomDoc.data()) === null || _a === void 0 ? void 0 : _a.members) || [];
        const recipientIds = members.filter((memberId) => memberId !== senderId);
        const readStateRefs = recipientIds.map((memberId) => roomRef.collection('readStates').doc(memberId));
        const readStateDocs = readStateRefs.length > 0
            ? await transaction.getAll(...readStateRefs)
            : [];
        const readBy = new Set(currentMessage.readBy || []);
        const createdAt = currentMessage.createdAt;
        const updates = {};
        recipientIds.forEach((memberId, index) => {
            var _a, _b;
            const lastReadAt = (_b = (_a = readStateDocs[index]) === null || _a === void 0 ? void 0 : _a.data()) === null || _b === void 0 ? void 0 : _b.lastReadAt;
            const wasAlreadyRead = readBy.has(memberId)
                || (createdAt instanceof firestore_2.Timestamp
                    && lastReadAt instanceof firestore_2.Timestamp
                    && lastReadAt.toMillis() >= createdAt.toMillis());
            if (!wasAlreadyRead) {
                updates[`unreadCounts.${memberId}`] = firestore_2.FieldValue.increment(1);
            }
        });
        if (Object.keys(updates).length > 0)
            transaction.update(roomRef, updates);
        // Eventarc の再配信でも同じメッセージを二重加算しないよう、
        // ルーム更新と同じトランザクション内で適用済みを記録する。
        transaction.update(messageRef, {
            unreadCountApplied: true,
            unreadCountAppliedAt: firestore_2.FieldValue.serverTimestamp(),
        });
    });
});
// メッセージ作成時にプッシュ通知を送信
exports.sendPushNotificationOnNewMessage = (0, firestore_1.onDocumentCreated)({ document: 'chatRooms/{chatRoomId}/messages/{messageId}', retry: true }, async (event) => {
    var _a, _b, _c;
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
    const claim = await (0, notificationDelivery_1.claimDelivery)(db, deliveryId);
    if (claim === 'already_sent' || claim === 'exhausted')
        return;
    if (claim === 'busy')
        throw new Error('notification-delivery-busy');
    console.log(`New message in room ${chatRoomId} from ${senderName}`);
    // チャットルーム情報を取得
    const chatRoomDoc = await db.collection('chatRooms').doc(chatRoomId).get();
    if (!chatRoomDoc.exists) {
        console.log('Chat room not found');
        return;
    }
    const chatRoom = chatRoomDoc.data();
    if (!chatRoom)
        return;
    const roomName = chatRoom.name || 'チャットルーム';
    // フロントエンドでは 'members' フィールドを使用
    const memberIds = chatRoom.members || [];
    console.log(`Room: ${roomName}, members: ${JSON.stringify(memberIds)}, senderId: ${senderId}`);
    // 送信者以外の全メンバーに通知を送信
    const recipientIds = memberIds.filter((id) => id !== senderId);
    console.log(`Recipients: ${JSON.stringify(recipientIds)}`);
    if (recipientIds.length === 0) {
        console.log('No recipients to notify (memberIds might not include other members)');
        await (0, notificationDelivery_1.finishDelivery)(db, deliveryId, 'sent');
        return;
    }
    // 各受信者のFCMトークンを取得（ミュート設定を考慮）
    const tokens = [];
    const tokenOwners = new Map();
    for (const userId of recipientIds) {
        // ミュート設定を確認
        const muteSettingDoc = await db
            .collection('users')
            .doc(userId)
            .collection('notificationSettings')
            .doc(chatRoomId)
            .get();
        if (muteSettingDoc.exists && ((_a = muteSettingDoc.data()) === null || _a === void 0 ? void 0 : _a.muted) === true) {
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
            var _a;
            const tokenData = doc.data();
            if (tokenData.token) {
                if (!tokens.includes(tokenData.token)) {
                    tokens.push(tokenData.token);
                }
                const owners = (_a = tokenOwners.get(tokenData.token)) !== null && _a !== void 0 ? _a : new Set();
                owners.add(userId);
                tokenOwners.set(tokenData.token, owners);
                console.log(`Added token: ${tokenData.token.substring(0, 20)}...`);
            }
        });
    }
    if (tokens.length === 0) {
        console.log('No FCM tokens found for recipients');
        await (0, notificationDelivery_1.finishDelivery)(db, deliveryId, 'sent');
        return;
    }
    console.log(`Sending notification to ${tokens.length} tokens`);
    // 通知メッセージを構築
    let bodyText = messageText;
    if (message.imageURL) {
        bodyText = '画像を送信しました';
    }
    else if (message.fileURL) {
        bodyText = 'ファイルを送信しました';
    }
    // Web Push用のペイロード構築
    // Service Workerで通知を表示するため、dataフィールドにカスタムデータを含める
    // webpush.headersでTTLとUrgencyを設定し、FCMのデフォルト動作を制御
    const notificationPayload = {
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
                TTL: '86400', // 24時間
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
            const invalidTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    console.log(`Failed to send to token: ${tokens[idx]}`, resp.error);
                    if ((0, fcm_1.isInvalidRegistrationToken)(resp.error)) {
                        invalidTokens.push(tokens[idx]);
                    }
                }
            });
            for (const invalidToken of invalidTokens) {
                const owners = (_b = tokenOwners.get(invalidToken)) !== null && _b !== void 0 ? _b : new Set();
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
        await (0, notificationDelivery_1.finishDelivery)(db, deliveryId, 'sent');
    }
    catch (error) {
        console.error('Error sending notifications:', error);
        await (0, notificationDelivery_1.finishDelivery)(db, deliveryId, 'failed', (_c = error.code) !== null && _c !== void 0 ? _c : 'unknown');
        throw error;
    }
});
exports.sendScheduleNotifications = (0, scheduler_1.onSchedule)({
    schedule: 'every 1 minutes',
    timeZone: 'Asia/Tokyo',
}, async () => {
    var _a, _b, _c, _d, _e, _f;
    const now = Date.now();
    // 通知が発火し得る開始日時の予定と、現在が通知時刻のカスタム通知だけを読む。
    // enabled=true の全予定を毎分読み続けると、通知済みの過去予定も永続的に課金対象になる。
    const standardWindowStart = firestore_2.Timestamp.fromMillis(now - 24 * 60 * 60 * 1000);
    const standardWindowEnd = firestore_2.Timestamp.fromMillis(now + 48 * 60 * 60 * 1000);
    const customWindowStart = firestore_2.Timestamp.fromMillis(now - scheduleTime_1.SCHEDULE_NOTIFICATION_GRACE_MS);
    const customWindowEnd = firestore_2.Timestamp.fromMillis(now);
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
    const scheduleDocs = new Map([...standardSnapshot.docs, ...customSnapshot.docs].map((scheduleDoc) => [scheduleDoc.id, scheduleDoc]));
    let allActiveUserIdsPromise = null;
    const getAllActiveUserIds = () => {
        if (!allActiveUserIdsPromise) {
            allActiveUserIdsPromise = db.collection('users').get().then((snapshot) => (snapshot.docs
                .filter((userDoc) => {
                var _a;
                const lifecycleState = (_a = userDoc.data().lifecycleState) !== null && _a !== void 0 ? _a : 'active';
                return lifecycleState !== 'deleted' && lifecycleState !== 'disabling';
            })
                .map((userDoc) => userDoc.id)));
        }
        return allActiveUserIdsPromise;
    };
    for (const scheduleDoc of scheduleDocs.values()) {
        const schedule = scheduleDoc.data();
        const timings = (_b = (_a = schedule.notification) === null || _a === void 0 ? void 0 : _a.timings) !== null && _b !== void 0 ? _b : [];
        if (timings.length === 0)
            continue;
        const sentKeys = new Set((_c = schedule.sentNotificationKeys) !== null && _c !== void 0 ? _c : []);
        const recipientIds = (0, scheduleTime_1.resolveScheduleRecipientIds)(schedule, ((_d = schedule.notification) === null || _d === void 0 ? void 0 : _d.recipientScope) === 'all' ? await getAllActiveUserIds() : []);
        if (recipientIds.length === 0)
            continue;
        for (const timing of timings) {
            const notifyAt = (0, scheduleTime_1.getScheduleNotificationTime)(schedule, timing);
            if (!notifyAt)
                continue;
            const notifyAtMs = notifyAt.getTime();
            if (notifyAtMs > now || notifyAtMs < now - scheduleTime_1.SCHEDULE_NOTIFICATION_GRACE_MS)
                continue;
            const notificationKey = `${scheduleDoc.id}:${timing}:${notifyAtMs}`;
            if (sentKeys.has(notificationKey))
                continue;
            const deliveryId = `schedule_${notificationKey}`;
            const claim = await (0, notificationDelivery_1.claimDelivery)(db, deliveryId);
            if (claim === 'already_sent' || claim === 'exhausted')
                continue;
            if (claim === 'busy')
                throw new Error('notification-delivery-busy');
            const { tokens, tokenOwners } = await (0, fcm_1.getFcmTokensForUsers)(db, recipientIds);
            if (tokens.length === 0) {
                console.log(`No FCM tokens found for schedule ${scheduleDoc.id}`);
                await scheduleDoc.ref.update({
                    sentNotificationKeys: firestore_2.FieldValue.arrayUnion(notificationKey),
                    updatedAt: firestore_2.FieldValue.serverTimestamp()
                });
                await (0, notificationDelivery_1.finishDelivery)(db, deliveryId, 'sent');
                continue;
            }
            const targetUsers = ((_e = schedule.targetUserNames) === null || _e === void 0 ? void 0 : _e.length)
                ? ` / ${schedule.targetUserNames.join('、')}`
                : '';
            const notificationPayload = {
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
                const invalidTokens = [];
                response.responses.forEach((resp, index) => {
                    if (!resp.success && (0, fcm_1.isInvalidRegistrationToken)(resp.error)) {
                        invalidTokens.push(tokens[index]);
                    }
                });
                await (0, fcm_1.deleteInvalidTokens)(db, invalidTokens, tokenOwners);
                await scheduleDoc.ref.update({
                    sentNotificationKeys: firestore_2.FieldValue.arrayUnion(notificationKey),
                    updatedAt: firestore_2.FieldValue.serverTimestamp()
                });
                await (0, notificationDelivery_1.finishDelivery)(db, deliveryId, 'sent');
            }
            catch (error) {
                console.error(`Error sending schedule notification ${scheduleDoc.id}:`, error);
                await (0, notificationDelivery_1.finishDelivery)(db, deliveryId, 'failed', (_f = error.code) !== null && _f !== void 0 ? _f : 'unknown');
                throw error;
            }
        }
    }
});
// readStates の lastReadAt から unreadCounts を正規化
exports.normalizeUnreadCountOnReadStateWrite = (0, firestore_1.onDocumentWritten)('chatRooms/{chatRoomId}/readStates/{userId}', async (event) => {
    var _a;
    const after = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after;
    if (!(after === null || after === void 0 ? void 0 : after.exists))
        return;
    const { chatRoomId, userId } = event.params;
    const eventData = after.data();
    if (!eventData)
        return;
    const lastReadAt = eventData === null || eventData === void 0 ? void 0 : eventData.lastReadAt;
    if (!(lastReadAt instanceof firestore_2.Timestamp))
        return;
    const eventVersion = typeof eventData.version === 'number' ? eventData.version : 0;
    const roomRef = db.collection('chatRooms').doc(chatRoomId);
    const readStateRef = roomRef.collection('readStates').doc(userId);
    await db.runTransaction(async (transaction) => {
        var _a, _b;
        const [roomSnapshot, readStateSnapshot] = await Promise.all([
            transaction.get(roomRef),
            transaction.get(readStateRef),
        ]);
        if (!roomSnapshot.exists || !readStateSnapshot.exists)
            return;
        if (((_b = (_a = readStateSnapshot.data()) === null || _a === void 0 ? void 0 : _a.version) !== null && _b !== void 0 ? _b : 0) !== eventVersion)
            return;
        const messages = await transaction.get(roomRef.collection('messages').where('createdAt', '>', lastReadAt));
        const unreadCount = messages.docs.filter((messageDoc) => {
            const message = messageDoc.data();
            return message.senderId !== userId && message.isDeleted !== true;
        }).length;
        transaction.update(roomRef, {
            [`unreadCounts.${userId}`]: unreadCount,
            [`unreadVersions.${userId}`]: eventVersion,
        });
    });
});
// メッセージ添付の fileSize 差分を storageUsage に反映
exports.updateStorageUsageOnMessageWrite = (0, firestore_1.onDocumentWritten)('chatRooms/{chatRoomId}/messages/{messageId}', async (event) => {
    var _a, _b;
    const beforeSize = (0, storageUsage_1.getTrackedFileSize)((_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data());
    const afterSize = (0, storageUsage_1.getTrackedFileSize)((_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data());
    await (0, storageUsage_1.adjustStorageUsage)(db, afterSize - beforeSize);
});
exports.cleanupDeletingAttachment = (0, firestore_1.onDocumentUpdated)({ document: 'chatRooms/{chatRoomId}/messages/{messageId}', retry: true }, async (event) => {
    var _a, _b, _c;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const afterSnapshot = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after;
    const after = afterSnapshot === null || afterSnapshot === void 0 ? void 0 : afterSnapshot.data();
    if (!before || !after || !afterSnapshot)
        return;
    if (before.attachmentState === 'deleting' || after.attachmentState !== 'deleting')
        return;
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
            attachmentError: firestore_2.FieldValue.delete(),
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
        });
    }
    catch (error) {
        await afterSnapshot.ref.update({
            attachmentState: 'failed',
            attachmentError: (_c = error.code) !== null && _c !== void 0 ? _c : 'attachment-delete-failed',
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
        });
        throw error;
    }
});
// プロフィール画像の fileSize 差分を storageUsage に反映
exports.updateStorageUsageOnUserWrite = (0, firestore_1.onDocumentWritten)('users/{userId}', async (event) => {
    var _a, _b;
    const beforeSize = (0, storageUsage_1.getTrackedPhotoFileSize)((_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data());
    const afterSize = (0, storageUsage_1.getTrackedPhotoFileSize)((_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data());
    await (0, storageUsage_1.adjustStorageUsage)(db, afterSize - beforeSize);
});
// グループ画像の fileSize 差分を storageUsage に反映
exports.updateStorageUsageOnRoomWrite = (0, firestore_1.onDocumentWritten)('chatRooms/{chatRoomId}', async (event) => {
    var _a, _b;
    const beforeSize = (0, storageUsage_1.getTrackedPhotoFileSize)((_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data());
    const afterSize = (0, storageUsage_1.getTrackedPhotoFileSize)((_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data());
    await (0, storageUsage_1.adjustStorageUsage)(db, afterSize - beforeSize);
});
// ユーザープロフィール更新時に各チャットルームのmemberDetailsを同期
exports.syncMemberDetailsOnProfileUpdate = (0, firestore_1.onDocumentUpdated)('users/{userId}', async (event) => {
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
                [`memberDetails.${userId}.displayName`]: afterDisplayName !== null && afterDisplayName !== void 0 ? afterDisplayName : 'Unknown',
                [`memberDetails.${userId}.photoURL`]: afterPhotoURL
            });
        });
        await batch.commit();
    }
    console.log(`Synced memberDetails for user ${userId} in ${joinedRoomsSnapshot.size} rooms`);
});
// 【M0】工程管理（process management）の Cloud Functions を再エクスポートする。
// これを忘れると functions/src/process/* の関数はビルドは通るがデプロイされない。
// デプロイ後 `firebase functions:list` に onProjectUpdated が表示されることを確認。
__exportStar(require("./process"), exports);
__exportStar(require("./userLifecycle"), exports);
__exportStar(require("./roomLifecycle"), exports);
//# sourceMappingURL=index.js.map