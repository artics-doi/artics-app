// Firebase設定ファイル
// ※ 実際のFirebaseプロジェクト作成後に値を設定してください

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import type { Messaging } from 'firebase/messaging';

// Firebaseの設定情報
// Firebase Consoleから取得した値をここに設定します
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_STORAGE_BUCKET",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID"
};

// VAPID Key for Web Push
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "";

// Firebaseアプリの初期化
const app = initializeApp(firebaseConfig);

// 各サービスのエクスポート
export const auth = getAuth(app);           // 認証
export const db = getFirestore(app);        // データベース
export const storage = getStorage(app);     // ファイルストレージ

// Firebase Cloud Messaging（ブラウザ環境のみ）
let messaging: Messaging | null = null;

export const initializeMessaging = async (): Promise<Messaging | null> => {
  if (messaging) return messaging;

  try {
    const supported = await isSupported();
    if (supported) {
      messaging = getMessaging(app);
      return messaging;
    }
  } catch (error) {
    console.error('FCM is not supported:', error);
  }
  return null;
};

// FCMトークンを取得
// firebase-messaging-sw.jsを明示的に登録して使用
export const getFCMToken = async (): Promise<string | null> => {
  try {
    const msg = await initializeMessaging();
    if (!msg) {
      console.log('[FCM] Messaging not initialized');
      return null;
    }

    console.log('[FCM] getToken呼び出し中... VAPID Key長さ:', VAPID_KEY.length);

    // firebase-messaging-sw.jsを明示的に登録
    // これにより、PWAのService Worker(sw.js)との競合を防ぐ
    const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/firebase-cloud-messaging-push-scope'
    });
    console.log('[FCM] Service Worker登録成功:', swRegistration.scope);

    const token = await getToken(msg, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration
    });

    if (token) {
      console.log('[FCM] Token取得成功:', token.substring(0, 20) + '...');
      return token;
    } else {
      console.log('[FCM] トークンが空です');
      return null;
    }
  } catch (error) {
    console.error('[FCM] トークン取得エラー:', error);
    return null;
  }
};

// フォアグラウンドメッセージのリスナー設定
export const onForegroundMessage = (callback: (payload: unknown) => void) => {
  initializeMessaging().then((msg) => {
    if (msg) {
      onMessage(msg, (payload) => {
        console.log('Foreground message received:', payload);
        callback(payload);
      });
    }
  });
};

export default app;
