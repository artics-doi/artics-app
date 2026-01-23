"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotificationOnNewMessage = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-functions/v2/firestore");
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
// メッセージ作成時にプッシュ通知を送信
exports.sendPushNotificationOnNewMessage = (0, firestore_1.onDocumentCreated)('chatRooms/{chatRoomId}/messages/{messageId}', async (event) => {
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
    const messageType = message.type || 'text';
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
    // メンションがある場合はメンションされた人だけに通知
    // メンションがない場合は通知を送らない（全員への通知は不要）
    const mentions = message.mentions || [];
    console.log(`Mentions: ${JSON.stringify(mentions)}`);
    // メンションがない場合は通知を送らない
    if (mentions.length === 0) {
        console.log('No mentions found, skipping notification');
        return;
    }
    // メンションされた人のうち、送信者以外に通知を送信
    const recipientIds = mentions.filter((id) => id !== senderId);
    console.log(`Recipients (mentioned users): ${JSON.stringify(recipientIds)}`);
    if (recipientIds.length === 0) {
        console.log('No recipients to notify (memberIds might not include other members)');
        return;
    }
    // 各受信者のFCMトークンを取得
    const tokens = [];
    for (const userId of recipientIds) {
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
                tokens.push(tokenData.token);
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
    if (messageType === 'image') {
        bodyText = '画像を送信しました';
    }
    else if (messageType === 'file') {
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
            const failedTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    failedTokens.push(tokens[idx]);
                    console.log(`Failed to send to token: ${tokens[idx]}`, resp.error);
                }
            });
            // 無効なトークンを削除
            for (const failedToken of failedTokens) {
                for (const userId of recipientIds) {
                    const tokenDoc = await db
                        .collection('users')
                        .doc(userId)
                        .collection('fcmTokens')
                        .doc(failedToken)
                        .get();
                    if (tokenDoc.exists) {
                        await tokenDoc.ref.delete();
                        console.log(`Deleted invalid token for user ${userId}`);
                    }
                }
            }
        }
    }
    catch (error) {
        console.error('Error sending notifications:', error);
    }
});
//# sourceMappingURL=index.js.map