import { useEffect, useState } from 'react';
import { doc, setDoc, serverTimestamp, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db, getFCMToken } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { isElectronEnv } from './useElectronNotification';

export function useFCMToken() {
  const { currentUser } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Electron環境ではFCMを使用しない
    if (isElectronEnv()) {
      console.log('[FCM] Electron環境のためFCMは無効');
      return;
    }

    // Service Worker非対応ブラウザのチェック
    if (!('serviceWorker' in navigator)) {
      console.log('[FCM] Service Worker非対応');
      return;
    }

    // Notification API非対応ブラウザのチェック
    if (!('Notification' in window)) {
      console.log('[FCM] Notification API非対応');
      return;
    }

    if (!currentUser) {
      console.log('[FCM] ユーザー未ログイン');
      return;
    }

    const initFCM = async () => {
      setLoading(true);
      console.log('[FCM] 初期化開始...');

      try {
        // 現在の通知許可状態を確認
        console.log('[FCM] 現在の通知許可状態:', Notification.permission);

        // 通知許可をリクエスト
        const permission = await Notification.requestPermission();
        console.log('[FCM] 通知許可リクエスト結果:', permission);

        if (permission !== 'granted') {
          setError('通知の許可が必要です');
          console.log('[FCM] 通知が許可されていません');
          setLoading(false);
          return;
        }

        // FCMトークンを取得
        console.log('[FCM] トークン取得中...');
        const fcmToken = await getFCMToken();
        console.log('[FCM] トークン取得結果:', fcmToken ? '成功' : '失敗');

        if (fcmToken) {
          setToken(fcmToken);
          console.log('[FCM] トークン:', fcmToken.substring(0, 20) + '...');

          // Firestoreにトークンを保存（古いトークンは削除）
          console.log('[FCM] Firestoreにトークンを保存中...');
          await saveFCMToken(currentUser.uid, fcmToken);
          console.log('[FCM] トークン保存完了');

          // フォアグラウンドメッセージは処理しない
          // アプリが開いている時は既にリアルタイムでメッセージが表示されるため
          // 通知はバックグラウンド（アプリを閉じている時）のみ表示
        } else {
          console.log('[FCM] トークン取得失敗');
          setError('FCMトークンを取得できませんでした');
        }
      } catch (err) {
        console.error('[FCM] 初期化エラー:', err);
        setError('プッシュ通知の初期化に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    initFCM();
  }, [currentUser]);

  return { token, error, loading };
}

// FCMトークンをFirestoreに保存（古いトークンは削除）
async function saveFCMToken(userId: string, token: string) {
  try {
    const tokensRef = collection(db, 'users', userId, 'fcmTokens');

    // 既存のトークンを取得して、現在のトークン以外を削除
    const existingTokens = await getDocs(tokensRef);
    const deletePromises: Promise<void>[] = [];

    existingTokens.docs.forEach((tokenDoc) => {
      if (tokenDoc.id !== token) {
        console.log('[FCM] 古いトークンを削除:', tokenDoc.id.substring(0, 20) + '...');
        deletePromises.push(deleteDoc(tokenDoc.ref));
      }
    });

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
      console.log(`[FCM] ${deletePromises.length}個の古いトークンを削除しました`);
    }

    // 新しいトークンを保存
    const tokenRef = doc(db, 'users', userId, 'fcmTokens', token);
    await setDoc(tokenRef, {
      token,
      createdAt: serverTimestamp(),
      platform: 'web',
      userAgent: navigator.userAgent
    }, { merge: true });
    console.log('[FCM] Firestore保存成功');
  } catch (err) {
    console.error('[FCM] Firestore保存エラー:', err);
    throw err;
  }
}
