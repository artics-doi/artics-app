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
exports.syncMemberDetailsOnProfileUpdate = exports.updateStorageUsageOnRoomWrite = exports.updateStorageUsageOnUserWrite = exports.updateStorageUsageOnMessageWrite = exports.normalizeUnreadCountOnReadStateWrite = exports.sendScheduleNotifications = exports.sendPushNotificationOnNewMessage = exports.updateUnreadCountsOnNewMessage = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_2 = require("firebase-admin/firestore");
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
function getTrackedFileSize(data) {
    if (!(data === null || data === void 0 ? void 0 : data.storagePath) || typeof data.fileSize !== 'number')
        return 0;
    return data.fileSize;
}
function getTrackedPhotoFileSize(data) {
    if (!(data === null || data === void 0 ? void 0 : data.photoStoragePath) || typeof data.photoFileSize !== 'number')
        return 0;
    return data.photoFileSize;
}
async function adjustStorageUsage(deltaBytes) {
    if (deltaBytes === 0)
        return;
    await db.collection('settings').doc('storageUsage').set({
        totalBytes: firestore_2.FieldValue.increment(deltaBytes),
        lastUpdated: firestore_2.FieldValue.serverTimestamp()
    }, { merge: true });
}
function isInvalidRegistrationToken(error) {
    return (error === null || error === void 0 ? void 0 : error.code) === 'messaging/registration-token-not-registered' ||
        (error === null || error === void 0 ? void 0 : error.code) === 'messaging/invalid-registration-token' ||
        (error === null || error === void 0 ? void 0 : error.code) === 'messaging/invalid-argument';
}
const SCHEDULE_NOTIFICATION_GRACE_MS = 2 * 60 * 1000;
function withTime(date, hours, minutes) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}
function getScheduleNotificationTime(schedule, timing) {
    var _a, _b, _c, _d;
    const startAt = (_a = schedule.startAt) === null || _a === void 0 ? void 0 : _a.toDate();
    if (!startAt)
        return null;
    if (timing === 'custom')
        return (_d = (_c = (_b = schedule.notification) === null || _b === void 0 ? void 0 : _b.customAt) === null || _c === void 0 ? void 0 : _c.toDate()) !== null && _d !== void 0 ? _d : null;
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
async function getFcmTokensForUsers(userIds) {
    const tokens = [];
    const tokenOwners = new Map();
    for (const userId of userIds) {
        const tokensSnapshot = await db
            .collection('users')
            .doc(userId)
            .collection('fcmTokens')
            .get();
        tokensSnapshot.docs.forEach((doc) => {
            var _a;
            const token = doc.data().token;
            if (!token)
                return;
            if (!tokens.includes(token))
                tokens.push(token);
            const owners = (_a = tokenOwners.get(token)) !== null && _a !== void 0 ? _a : new Set();
            owners.add(userId);
            tokenOwners.set(token, owners);
        });
    }
    return { tokens, tokenOwners };
}
async function deleteInvalidTokens(invalidTokens, tokenOwners) {
    var _a;
    for (const invalidToken of invalidTokens) {
        const owners = (_a = tokenOwners.get(invalidToken)) !== null && _a !== void 0 ? _a : new Set();
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
exports.updateUnreadCountsOnNewMessage = (0, firestore_1.onDocumentCreated)('chatRooms/{chatRoomId}/messages/{messageId}', async (event) => {
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
    if (!roomData)
        return;
    const members = roomData.members || [];
    const createdAt = message.createdAt instanceof firestore_2.Timestamp ? message.createdAt : null;
    // 送信者以外の未読数を+1。ただし、Functions 実行時点ですでに readStates が進んでいるユーザーは増やさない。
    const updateData = {};
    await Promise.all(members.map(async (memberId) => {
        var _a;
        if (memberId === senderId)
            return;
        const readStateDoc = await roomRef.collection('readStates').doc(memberId).get();
        const lastReadAt = (_a = readStateDoc.data()) === null || _a === void 0 ? void 0 : _a.lastReadAt;
        const alreadyRead = createdAt &&
            lastReadAt instanceof firestore_2.Timestamp &&
            lastReadAt.toMillis() >= createdAt.toMillis();
        if (!alreadyRead) {
            updateData[`unreadCounts.${memberId}`] = firestore_2.FieldValue.increment(1);
        }
    }));
    if (Object.keys(updateData).length > 0) {
        try {
            await roomRef.update(updateData);
            console.log(`Updated unread counts for room ${chatRoomId}`);
        }
        catch (error) {
            console.error('Error updating unread counts:', error);
        }
    }
});
// メッセージ作成時にプッシュ通知を送信
exports.sendPushNotificationOnNewMessage = (0, firestore_1.onDocumentCreated)('chatRooms/{chatRoomId}/messages/{messageId}', async (event) => {
    var _a, _b;
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
                    if (isInvalidRegistrationToken(resp.error)) {
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
    }
    catch (error) {
        console.error('Error sending notifications:', error);
    }
});
exports.sendScheduleNotifications = (0, scheduler_1.onSchedule)({
    schedule: 'every 1 minutes',
    timeZone: 'Asia/Tokyo',
}, async () => {
    var _a, _b, _c, _d;
    const now = Date.now();
    const schedulesSnapshot = await db
        .collection('schedules')
        .where('notification.enabled', '==', true)
        .get();
    for (const scheduleDoc of schedulesSnapshot.docs) {
        const schedule = scheduleDoc.data();
        const timings = (_b = (_a = schedule.notification) === null || _a === void 0 ? void 0 : _a.timings) !== null && _b !== void 0 ? _b : [];
        if (timings.length === 0)
            continue;
        const sentKeys = new Set((_c = schedule.sentNotificationKeys) !== null && _c !== void 0 ? _c : []);
        const recipientIds = schedule.targetUserIds && schedule.targetUserIds.length > 0
            ? schedule.targetUserIds
            : schedule.createdBy
                ? [schedule.createdBy]
                : [];
        if (recipientIds.length === 0)
            continue;
        for (const timing of timings) {
            const notifyAt = getScheduleNotificationTime(schedule, timing);
            if (!notifyAt)
                continue;
            const notifyAtMs = notifyAt.getTime();
            if (notifyAtMs > now || notifyAtMs < now - SCHEDULE_NOTIFICATION_GRACE_MS)
                continue;
            const notificationKey = `${scheduleDoc.id}:${timing}:${notifyAtMs}`;
            if (sentKeys.has(notificationKey))
                continue;
            const { tokens, tokenOwners } = await getFcmTokensForUsers(recipientIds);
            if (tokens.length === 0) {
                console.log(`No FCM tokens found for schedule ${scheduleDoc.id}`);
                await scheduleDoc.ref.update({
                    sentNotificationKeys: firestore_2.FieldValue.arrayUnion(notificationKey),
                    updatedAt: firestore_2.FieldValue.serverTimestamp()
                });
                continue;
            }
            const targetUsers = ((_d = schedule.targetUserNames) === null || _d === void 0 ? void 0 : _d.length)
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
                    if (!resp.success && isInvalidRegistrationToken(resp.error)) {
                        invalidTokens.push(tokens[index]);
                    }
                });
                await deleteInvalidTokens(invalidTokens, tokenOwners);
                await scheduleDoc.ref.update({
                    sentNotificationKeys: firestore_2.FieldValue.arrayUnion(notificationKey),
                    updatedAt: firestore_2.FieldValue.serverTimestamp()
                });
            }
            catch (error) {
                console.error(`Error sending schedule notification ${scheduleDoc.id}:`, error);
            }
        }
    }
});
// readStates の lastReadAt から unreadCounts を正規化
exports.normalizeUnreadCountOnReadStateWrite = (0, firestore_1.onDocumentWritten)('chatRooms/{chatRoomId}/readStates/{userId}', async (event) => {
    var _a, _b;
    const after = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after;
    if (!(after === null || after === void 0 ? void 0 : after.exists))
        return;
    const { chatRoomId, userId } = event.params;
    const lastReadAt = (_b = after.data()) === null || _b === void 0 ? void 0 : _b.lastReadAt;
    if (!(lastReadAt instanceof firestore_2.Timestamp))
        return;
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
});
// メッセージ添付の fileSize 差分を storageUsage に反映
exports.updateStorageUsageOnMessageWrite = (0, firestore_1.onDocumentWritten)('chatRooms/{chatRoomId}/messages/{messageId}', async (event) => {
    var _a, _b;
    const beforeSize = getTrackedFileSize((_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data());
    const afterSize = getTrackedFileSize((_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data());
    await adjustStorageUsage(afterSize - beforeSize);
});
// プロフィール画像の fileSize 差分を storageUsage に反映
exports.updateStorageUsageOnUserWrite = (0, firestore_1.onDocumentWritten)('users/{userId}', async (event) => {
    var _a, _b;
    const beforeSize = getTrackedPhotoFileSize((_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data());
    const afterSize = getTrackedPhotoFileSize((_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data());
    await adjustStorageUsage(afterSize - beforeSize);
});
// グループ画像の fileSize 差分を storageUsage に反映
exports.updateStorageUsageOnRoomWrite = (0, firestore_1.onDocumentWritten)('chatRooms/{chatRoomId}', async (event) => {
    var _a, _b;
    const beforeSize = getTrackedPhotoFileSize((_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data());
    const afterSize = getTrackedPhotoFileSize((_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data());
    await adjustStorageUsage(afterSize - beforeSize);
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
//# sourceMappingURL=index.js.map