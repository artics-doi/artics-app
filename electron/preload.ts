// Electron プリロードスクリプト
import { contextBridge, ipcRenderer } from 'electron';
import type { NotificationOptions } from './notificationTypes';

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

interface WindowControlsState {
  maximized: boolean;
  compact: boolean;
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
  showNotification: (options: NotificationOptions): Promise<boolean> => {
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

  // タスクバーの未読件数バッジを更新（count が 0 のときは iconDataUrl に null を渡す）
  setUnreadBadge: (count: number, iconDataUrl: string | null): Promise<boolean> => {
    return ipcRenderer.invoke('set-unread-badge', count, iconDataUrl);
  },

  // Electron環境かどうかを確認
  isElectron: (): Promise<boolean> => {
    return ipcRenderer.invoke('is-electron');
  },

  // 予定表・工程管理を表示できる幅までメインウィンドウを広げる
  expandToWorkspace: (): Promise<boolean> => {
    return ipcRenderer.invoke('expand-to-workspace');
  },

  getWindowControlsState: (): Promise<WindowControlsState> => {
    return ipcRenderer.invoke('get-window-controls-state');
  },

  minimizeWindow: (): Promise<boolean> => ipcRenderer.invoke('window-minimize'),

  toggleMaximizeWindow: (): Promise<WindowControlsState> => ipcRenderer.invoke('window-toggle-maximize'),

  closeWindow: (): Promise<boolean> => ipcRenderer.invoke('window-close'),

  toggleChatCompact: (): Promise<WindowControlsState> => ipcRenderer.invoke('toggle-chat-compact'),

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
  },

  // 予定遷移のリスナー
  onNavigateToSchedule: (callback: (scheduleId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, scheduleId: string) => {
      callback(scheduleId);
    };
    ipcRenderer.on('navigate-to-schedule', listener);

    return () => {
      ipcRenderer.removeListener('navigate-to-schedule', listener);
    };
  },

  onNavigateToProcessTask: (callback: (target: { projectId: string; taskId: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, target: { projectId: string; taskId: string }) => callback(target);
    ipcRenderer.on('navigate-to-process-task', listener);
    return () => ipcRenderer.removeListener('navigate-to-process-task', listener);
  },

  onNavigateToChatList: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('navigate-to-chat-list', listener);
    return () => ipcRenderer.removeListener('navigate-to-chat-list', listener);
  },

  onWindowControlsStateChanged: (callback: (state: WindowControlsState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: WindowControlsState) => callback(state);
    ipcRenderer.on('window-controls-state-changed', listener);
    return () => ipcRenderer.removeListener('window-controls-state-changed', listener);
  }
};

// electronAPIをwindowオブジェクトに公開
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
