// Electron プリロードスクリプト
import { contextBridge, ipcRenderer } from 'electron';

// 通知設定の型
interface NotificationSettings {
  enableNotifications: boolean;
  showMessageContent: boolean;
  notifyActiveRoom: boolean;
}

// アップデート確認結果の型
interface UpdateCheckResult {
  available: boolean;
  version?: string;
  isDev?: boolean;
  error?: boolean;
}

// レンダラープロセスに公開するAPI
const electronAPI = {
  // アプリバージョンを取得
  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke('get-app-version');
  },

  // アップデートを確認
  checkForUpdates: (): Promise<UpdateCheckResult> => {
    return ipcRenderer.invoke('check-for-updates');
  },

  // 通知設定を取得
  getNotificationSettings: (): Promise<NotificationSettings> => {
    return ipcRenderer.invoke('get-notification-settings');
  },

  // 通知設定を更新
  setNotificationSettings: (settings: NotificationSettings): Promise<boolean> => {
    return ipcRenderer.invoke('set-notification-settings', settings);
  },

  // 通知を表示（roomIdを含む）
  showNotification: (options: { title: string; body: string; roomId?: string; kind?: 'chat' | 'schedule' }): Promise<boolean> => {
    return ipcRenderer.invoke('show-notification', options);
  },

  // 常に手前に表示の状態を取得
  getAlwaysOnTop: (): Promise<boolean> => {
    return ipcRenderer.invoke('get-always-on-top');
  },

  // 常に手前に表示を設定
  setAlwaysOnTop: (value: boolean): Promise<boolean> => {
    return ipcRenderer.invoke('set-always-on-top', value);
  },

  // タイトルバーのテーマ（明暗）を設定（アプリのライト/ダーク切替に追従）
  setTitleBarTheme: (theme: 'light' | 'dark'): Promise<boolean> => {
    return ipcRenderer.invoke('set-titlebar-theme', theme);
  },

  // Electron環境かどうかを確認
  isElectron: (): Promise<boolean> => {
    return ipcRenderer.invoke('is-electron');
  },

  // 外部リンクを開く
  openExternal: (url: string): Promise<boolean> => {
    return ipcRenderer.invoke('open-external', url);
  },

  // 許可されたNASパスを開く
  openNasPath: (path: string): Promise<boolean> => {
    return ipcRenderer.invoke('open-nas-path', path);
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
  },

  // ルーム遷移のリスナー
  onNavigateToRoom: (callback: (roomId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, roomId: string) => {
      callback(roomId);
    };
    ipcRenderer.on('navigate-to-room', listener);

    // クリーンアップ関数を返す
    return () => {
      ipcRenderer.removeListener('navigate-to-room', listener);
    };
  }
};

// electronAPIをwindowオブジェクトに公開
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
