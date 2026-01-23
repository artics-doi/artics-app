/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';

declare let self: ServiceWorkerGlobalScope;

// PWA Service Worker - キャッシュ専用
// Push通知はfirebase-messaging-sw.jsが処理するため、ここでは処理しない

self.skipWaiting();
clientsClaim();

// Workboxのプリキャッシュ
precacheAndRoute(self.__WB_MANIFEST);

// 古いキャッシュをクリーンアップ
cleanupOutdatedCaches();

// ナビゲーションルート（firebase-messaging-sw.jsは除外）
const navigationRoute = new NavigationRoute(
  async () => {
    const cache = await caches.open('navigation-cache');
    const cachedResponse = await cache.match('/index.html');
    if (cachedResponse) {
      return cachedResponse;
    }
    return fetch('/index.html');
  },
  {
    denylist: [/^\/firebase-messaging-sw\.js$/]
  }
);
registerRoute(navigationRoute);

// Firestoreのキャッシュ
registerRoute(
  /^https:\/\/firestore\.googleapis\.com\/.*/i,
  new NetworkFirst({
    cacheName: 'firestore-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 // 1 day
      })
    ]
  }),
  'GET'
);

// 重要: pushイベントは処理しない
// firebase-messaging-sw.jsがプッシュ通知を処理するため、
// このService Workerでは何もしない
// （pushイベントリスナーを登録しないことで、処理をスキップ）
