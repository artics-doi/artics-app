// Electron通知用カスタムフック
import { useState, useEffect, useCallback } from 'react';
import type { NotificationSettings } from '../types/electron';

// Electron環境かどうかを判定
export function isElectronEnv(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

// デフォルトの通知設定
const defaultSettings: NotificationSettings = {
  enableNotifications: true,
  showMessageContent: true,
  notifyActiveRoom: false
};

export function useElectronNotification() {
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
  const [isElectron, setIsElectron] = useState(false);

  // 初期化
  useEffect(() => {
    const init = async () => {
      if (isElectronEnv() && window.electronAPI) {
        setIsElectron(true);
        try {
          const currentSettings = await window.electronAPI.getNotificationSettings();
          setSettings(currentSettings);
        } catch (error) {
          console.error('通知設定の取得に失敗:', error);
        }

        // 設定変更のリスナーを登録
        const cleanup = window.electronAPI.onNotificationSettingsChanged((newSettings) => {
          setSettings(newSettings);
        });

        return cleanup;
      } else {
        setIsElectron(false);
        // H-9: 起動時の自動 Notification.requestPermission() を撤去。
        // ユーザー意思（設定モーダルの「通知を有効にする」ボタン）から useFCMToken.requestPermissionAndRegister() 経由で発火する。
      }
    };

    const cleanup = init();
    return () => {
      cleanup?.then(fn => fn?.());
    };
  }, []);

  // 通知を表示
  const showNotification = useCallback(async (
    title: string,
    body: string,
    messageId?: string,
    roomId?: string,
    kind: 'chat' | 'schedule' = 'chat',
    scheduleId?: string,
  ) => {
    if (isElectron && window.electronAPI) {
      // Electron環境（roomIdを渡して通知から直接ルームに遷移できるようにする）
      return await window.electronAPI.showNotification({ title, body, roomId, scheduleId, kind });
    } else {
      // ブラウザ環境
      if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, {
          body: settings.showMessageContent ? body : 'メッセージが届きました',
          icon: '/favicon.png',
          tag: messageId
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
        return true;
      }
      return false;
    }
  }, [isElectron, settings.showMessageContent]);

  // 通知設定を更新
  const updateSettings = useCallback(async (newSettings: NotificationSettings) => {
    if (isElectron && window.electronAPI) {
      const success = await window.electronAPI.setNotificationSettings(newSettings);
      if (success) {
        setSettings(newSettings);
      }
      return success;
    } else {
      // ブラウザ環境ではlocalStorageに保存
      localStorage.setItem('notificationSettings', JSON.stringify(newSettings));
      setSettings(newSettings);
      return true;
    }
  }, [isElectron]);

  return {
    settings,
    isElectron,
    showNotification,
    updateSettings
  };
}

