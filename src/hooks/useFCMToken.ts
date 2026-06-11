import { useCallback, useEffect, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, getFCMToken } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { isElectronEnv } from './useElectronNotification';

/**
 * FCM トークン管理 hook
 *
 * H-9: 起動時に自動で Notification.requestPermission() を呼ばない。
 * すでに通知許可が granted の場合のみトークン取得・保存を行う。
 * 通知許可の要求は requestPermissionAndRegister() を介したユーザー意思のみ。
 */
export function useFCMToken() {
  const { currentUser } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 通知許可がない・FCM 不可能な環境かどうかを判定
  const isUnsupportedEnv = (): boolean => {
    if (isElectronEnv()) return true;
    if (!('serviceWorker' in navigator)) return true;
    if (!('Notification' in window)) return true;
    return false;
  };

  // 内部処理: 既存の許可済み状態を前提にトークン取得＋保存
  const registerExistingToken = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const fcmToken = await getFCMToken();
      if (fcmToken) {
        setToken(fcmToken);
        await saveFCMToken(userId, fcmToken);
        setError(null);
      } else {
        setError('FCMトークンを取得できませんでした');
      }
    } catch (err) {
      console.error('[FCM] 初期化エラー:', err);
      setError('プッシュ通知の初期化に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  // 既に granted の場合のみ自動でトークン登録
  useEffect(() => {
    if (isUnsupportedEnv()) return;
    if (!currentUser) return;
    if (Notification.permission !== 'granted') {
      console.log('[FCM] 通知許可未取得のため自動登録をスキップ（ユーザー意思を待機）');
      return;
    }
    registerExistingToken(currentUser.uid);
  }, [currentUser, registerExistingToken]);

  /**
   * ユーザー操作（設定モーダルの「通知を有効にする」ボタンなど）から呼び出す。
   * 通知許可をリクエストし、許可された場合のみトークンを取得・保存する。
   *
   * @returns 'granted' | 'denied' | 'default' | 'unsupported'
   */
  const requestPermissionAndRegister = useCallback(async (): Promise<
    'granted' | 'denied' | 'default' | 'unsupported'
  > => {
    if (isUnsupportedEnv()) return 'unsupported';
    if (!currentUser) return 'default';
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await registerExistingToken(currentUser.uid);
        return 'granted';
      }
      return permission as 'denied' | 'default';
    } catch (err) {
      console.error('[FCM] 通知許可リクエストエラー:', err);
      setError('通知許可のリクエストに失敗しました');
      return 'denied';
    }
  }, [currentUser, registerExistingToken]);

  return { token, error, loading, requestPermissionAndRegister };
}

// FCMトークンをFirestoreに保存（他端末のトークンは保持）
async function saveFCMToken(userId: string, token: string) {
  try {
    const tokenRef = doc(db, 'users', userId, 'fcmTokens', token);
    await setDoc(tokenRef, {
      token,
      createdAt: serverTimestamp(),
      platform: 'web',
      userAgent: navigator.userAgent,
    }, { merge: true });
  } catch (err) {
    console.error('[FCM] Firestore保存エラー:', err);
    throw err;
  }
}
