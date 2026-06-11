import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { isElectronEnv } from './useElectronNotification';

export type DiagnosticStatus = 'ok' | 'pending' | 'denied' | 'unsupported' | 'error';

export interface NotificationDiagnostics {
  isElectron: boolean;
  permission: DiagnosticStatus;     // ブラウザ Notification 許可
  fcmToken: DiagnosticStatus;       // Firestore に保存された FCM トークン
  serviceWorker: DiagnosticStatus;  // FCM SW の登録状態
  permissionRaw: NotificationPermission | 'unsupported';
}

/**
 * H-10/M-31: 通知システム 3 段ステータスを診断する hook。
 *  - ブラウザ通知許可
 *  - FCM トークン保存状態
 *  - Service Worker 登録状態
 */
export function useNotificationDiagnostics(): {
  diagnostics: NotificationDiagnostics;
  refresh: () => Promise<void>;
  loading: boolean;
} {
  const { currentUser } = useAuth();
  const [diagnostics, setDiagnostics] = useState<NotificationDiagnostics>({
    isElectron: false,
    permission: 'pending',
    fcmToken: 'pending',
    serviceWorker: 'pending',
    permissionRaw: 'default',
  });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const electron = isElectronEnv();

      // 1. permission
      let permission: DiagnosticStatus;
      let permissionRaw: NotificationPermission | 'unsupported';
      if (electron) {
        permission = 'ok'; // Electron はネイティブ通知のため、ブラウザ Notification API は不要
        permissionRaw = 'granted';
      } else if (!('Notification' in window)) {
        permission = 'unsupported';
        permissionRaw = 'unsupported';
      } else {
        permissionRaw = Notification.permission;
        if (permissionRaw === 'granted') permission = 'ok';
        else if (permissionRaw === 'denied') permission = 'denied';
        else permission = 'pending';
      }

      // 2. FCM token
      let fcmToken: DiagnosticStatus;
      if (electron) {
        fcmToken = 'ok'; // Electron は FCM を使わない
      } else if (!currentUser) {
        fcmToken = 'pending';
      } else {
        try {
          const tokensSnap = await getDocs(collection(db, 'users', currentUser.uid, 'fcmTokens'));
          fcmToken = tokensSnap.empty ? 'pending' : 'ok';
        } catch (err) {
          console.warn('[Diagnostics] FCM token check error:', err);
          fcmToken = 'error';
        }
      }

      // 3. Service Worker
      let serviceWorker: DiagnosticStatus;
      if (electron) {
        serviceWorker = 'ok'; // Electron は SW を使わない
      } else if (!('serviceWorker' in navigator)) {
        serviceWorker = 'unsupported';
      } else {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          const hasFcmSw = regs.some((r) => r.scope.includes('firebase-cloud-messaging-push-scope'));
          serviceWorker = hasFcmSw ? 'ok' : 'pending';
        } catch (err) {
          console.warn('[Diagnostics] SW check error:', err);
          serviceWorker = 'error';
        }
      }

      setDiagnostics({
        isElectron: electron,
        permission,
        fcmToken,
        serviceWorker,
        permissionRaw,
      });
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { diagnostics, refresh, loading };
}
