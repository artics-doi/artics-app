// Firebase Cloud Messaging Service Worker
// pushイベントを直接処理して通知を表示（FCM SDKを使わない）

// M-30: 重複排除を IndexedDB ベースに移行。
// 旧実装は in-memory Set で SW がアイドル時に終了されると消える可能性があった。
// IndexedDB なら SW が再起動しても 5 分間の重複窓は維持される。

const DB_NAME = 'artics-fcm-dedupe';
const STORE_NAME = 'processed-messages';
const DEDUPE_WINDOW_MS = 5 * 60 * 1000; // 5 分

function openDedupeDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function isAlreadyProcessed(messageId) {
  try {
    const db = await openDedupeDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(messageId);
      req.onsuccess = () => {
        const record = req.result;
        if (!record) {
          resolve(false);
          return;
        }
        const age = Date.now() - record.processedAt;
        resolve(age <= DEDUPE_WINDOW_MS);
      };
      req.onerror = () => resolve(false);
    });
  } catch (e) {
    console.warn('[firebase-messaging-sw.js] IndexedDB unavailable, falling back to no-dedupe:', e);
    return false;
  }
}

async function markProcessed(messageId) {
  try {
    const db = await openDedupeDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ id: messageId, processedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    // 古いレコードを掃除（毎回ではなく確率的に実行して負荷軽減）
    if (Math.random() < 0.1) {
      await cleanupOldRecords();
    }
  } catch (e) {
    console.warn('[firebase-messaging-sw.js] markProcessed failed:', e);
  }
}

async function cleanupOldRecords() {
  try {
    const db = await openDedupeDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          resolve();
          return;
        }
        const age = Date.now() - cursor.value.processedAt;
        if (age > DEDUPE_WINDOW_MS) {
          cursor.delete();
        }
        cursor.continue();
      };
      req.onerror = () => resolve();
    });
  } catch (e) {
    console.warn('[firebase-messaging-sw.js] cleanupOldRecords failed:', e);
  }
}

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

  // messageId / scheduleNotificationId がない場合はスキップ
  const notificationId = pushData.processNotificationId
    ? `process-${pushData.processNotificationId}` : pushData.messageId || pushData.scheduleNotificationId;
  if (!notificationId) {
    console.log('[firebase-messaging-sw.js] No notification id, ignoring duplicate');
    return;
  }

  event.waitUntil((async () => {
    // M-30: IndexedDB ベースの重複判定
    if (await isAlreadyProcessed(notificationId)) {
      console.log('[firebase-messaging-sw.js] Notification already processed:', notificationId);
      return;
    }
    await markProcessed(notificationId);

    // 閲覧中ルームの抑制: フォーカス中のウィンドウがこのルームを開いているなら
    // OS通知を出さない（メッセージは画面上に見えている）。
    // バックグラウンドのタブしかない場合は通知を出す安全側の判定にする
    if (pushData.chatRoomId) {
      try {
        const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        const viewingThisRoom = windowClients.some((client) =>
          client.focused && client.url.includes(`#/chat/${pushData.chatRoomId}`)
        );
        if (viewingThisRoom) {
          console.log('[firebase-messaging-sw.js] Room is focused, skipping notification:', pushData.chatRoomId);
          return;
        }
      } catch (e) {
        console.warn('[firebase-messaging-sw.js] Active room check failed:', e);
      }
    }

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
      tag: pushData.processNotificationId ? notificationId : pushData.scheduleNotificationId
        ? `schedule-${pushData.scheduleId || 'default'}-${notificationId}`
        : `chat-${pushData.chatRoomId || 'default'}-${notificationId}`,
      data: {
        chatRoomId: pushData.chatRoomId,
        scheduleId: pushData.scheduleId,
        projectId: pushData.projectId,
        taskId: pushData.taskId,
        url: pushData.url || '/'
      },
      renotify: false  // 同じタグの通知は上書きしない
    };

    console.log('[firebase-messaging-sw.js] Showing notification:', notificationTitle);
    await self.registration.showNotification(notificationTitle, notificationOptions);
  })());
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
