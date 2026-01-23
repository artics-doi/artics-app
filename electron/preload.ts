// Electron プリロードスクリプト
import { contextBridge, ipcRenderer } from 'electron';

// 通知設定の型
interface NotificationSettings {
  enableNotifications: boolean;
  showMessageContent: boolean;
}

// レンダラープロセスに公開するAPI
const electronAPI = {
  // 通知設定を取得
  getNotificationSettings: (): Promise<NotificationSettings> => {
    return ipcRenderer.invoke('get-notification-settings');
  },

  // 通知設定を更新
  setNotificationSettings: (settings: NotificationSettings): Promise<boolean> => {
    return ipcRenderer.invoke('set-notification-settings', settings);
  },

  // スタートアップ設定を取得
  getStartupEnabled: (): Promise<boolean> => {
    return ipcRenderer.invoke('get-startup-enabled');
  },

  // スタートアップ設定を更新
  setStartupEnabled: (enabled: boolean): Promise<boolean> => {
    return ipcRenderer.invoke('set-startup-enabled', enabled);
  },

  // 通知を表示
  showNotification: (options: { title: string; body: string }): Promise<boolean> => {
    return ipcRenderer.invoke('show-notification', options);
  },

  // Electron環境かどうかを確認
  isElectron: (): Promise<boolean> => {
    return ipcRenderer.invoke('is-electron');
  },

  // 外部リンクを開く
  openExternal: (url: string): Promise<boolean> => {
    return ipcRenderer.invoke('open-external', url);
  },

  // 通知設定変更のリスナー
  onNotificationSettingsChanged: (callback: (settings: NotificationSettings) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: NotificationSettings) => {
      callback(settings);
    };
    ipcRenderer.on('notification-settings-changed', listener);

    // クリーンアップ関数を返す
    return () => {
      ipcRenderer.removeListener('notification-settings-changed', listener);
    };
  }
};

// electronAPIをwindowオブジェクトに公開
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
