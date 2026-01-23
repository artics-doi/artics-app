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
  showMessageContent: true
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
        // ブラウザ環境では通知許可をリクエスト
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission();
        }
      }
    };

    const cleanup = init();
    return () => {
      cleanup?.then(fn => fn?.());
    };
  }, []);

  // 通知を表示
  const showNotification = useCallback(async (title: string, body: string, messageId?: string) => {
    if (isElectron && window.electronAPI) {
      // Electron環境
      return await window.electronAPI.showNotification({ title, body });
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

// スタートアップ設定用フック
export function useStartupSettings() {
  const [enabled, setEnabled] = useState(false);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (isElectronEnv() && window.electronAPI) {
        setIsElectron(true);
        try {
          const startupEnabled = await window.electronAPI.getStartupEnabled();
          setEnabled(startupEnabled);
        } catch (error) {
          console.error('スタートアップ設定の取得に失敗:', error);
        }
      }
    };

    init();
  }, []);

  const setStartupEnabled = useCallback(async (value: boolean) => {
    if (isElectron && window.electronAPI) {
      const success = await window.electronAPI.setStartupEnabled(value);
      if (success) {
        setEnabled(value);
      }
      return success;
    }
    return false;
  }, [isElectron]);

  return {
    enabled,
    isElectron,
    setStartupEnabled
  };
}
