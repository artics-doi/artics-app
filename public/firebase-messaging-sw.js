// Firebase Cloud Messaging Service Worker
// pushイベントを直接処理して通知を表示（FCM SDKを使わない）

// 既に処理済みのメッセージIDを追跡（2重通知防止）
const processedMessages = new Set();

// pushイベントを直接リッスン
self.addEventListener('push', (event) => {
  console.log('[firebase-messaging-sw.js] Push event received');

  if (!event.data) {
    console.log('[firebase-messaging-sw.js] No data in push event, ignoring');
    return;
  }

  let data = {};
  try {
    data = event.data.json();
    console.log('[firebase-messaging-sw.js] Push data:', JSON.stringify(data));
  } catch (e) {
    console.log('[firebase-messaging-sw.js] Failed to parse push data:', e);
    return;
  }

  // FCMからのdataフィールドを取得（FCMはdataを入れ子にする場合がある）
  const pushData = data.data || data;

  // messageIdがない場合、または既に処理済みの場合はスキップ
  const messageId = pushData.messageId;
  if (!messageId) {
    console.log('[firebase-messaging-sw.js] No messageId, ignoring duplicate');
    return;
  }

  if (processedMessages.has(messageId)) {
    console.log('[firebase-messaging-sw.js] Message already processed:', messageId);
    return;
  }

  // 処理済みとしてマーク（5分後に削除）
  processedMessages.add(messageId);
  setTimeout(() => processedMessages.delete(messageId), 5 * 60 * 1000);

  // titleがない場合は通知を表示しない（不正なプッシュ）
  if (!pushData.title) {
    console.log('[firebase-messaging-sw.js] No title in pushData, ignoring');
    return;
  }

  const notificationTitle = pushData.title;
  const notificationOptions = {
    body: pushData.body || '',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: `chat-${pushData.chatRoomId || 'default'}-${messageId}`,
    data: {
      chatRoomId: pushData.chatRoomId,
      url: pushData.url || '/'
    },
    renotify: false  // 同じタグの通知は上書きしない
  };

  console.log('[firebase-messaging-sw.js] Showing notification:', notificationTitle);

  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions)
  );
});

// 通知クリック時の処理
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked:', event);
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 既存のウィンドウがあればフォーカス
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      // なければ新しいウィンドウを開く
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
