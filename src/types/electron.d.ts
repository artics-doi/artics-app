// Electron API の型定義

export interface NotificationSettings {
  enableNotifications: boolean;
  showMessageContent: boolean;
  notifyActiveRoom: boolean;
}

export interface UpdateCheckResult {
  available: boolean;
  version?: string;
  isDev?: boolean;
  error?: boolean;
}

export interface WindowControlsState {
  maximized: boolean;
  compact: boolean;
}

export interface ElectronAPI {
  // アプリバージョンを取得
  getAppVersion: () => Promise<string>;

  // アップデートを確認
  checkForUpdates: () => Promise<UpdateCheckResult>;

  // 通知設定を取得
  getNotificationSettings: () => Promise<NotificationSettings>;

  // 通知設定を更新
  setNotificationSettings: (settings: NotificationSettings) => Promise<boolean>;

  // 通知を表示
  showNotification: (options: { title: string; body: string; roomId?: string; scheduleId?: string; kind?: 'chat' | 'schedule' }) => Promise<boolean>;

  // 常に手前に表示の状態を取得
  getAlwaysOnTop: () => Promise<boolean>;

  // 常に手前に表示を設定
  setAlwaysOnTop: (value: boolean) => Promise<boolean>;

  // タイトルバーのテーマ（明暗）を設定
  setTitleBarTheme: (theme: 'light' | 'dark') => Promise<boolean>;

  // タスクバーの未読件数バッジを更新
  setUnreadBadge: (count: number, iconDataUrl: string | null) => Promise<boolean>;

  // Electron環境かどうかを確認
  isElectron: () => Promise<boolean>;

  // 予定表・工程管理を表示できる幅までメインウィンドウを広げる
  expandToWorkspace: () => Promise<boolean>;

  getWindowControlsState: () => Promise<WindowControlsState>;
  minimizeWindow: () => Promise<boolean>;
  toggleMaximizeWindow: () => Promise<WindowControlsState>;
  closeWindow: () => Promise<boolean>;
  toggleChatCompact: () => Promise<WindowControlsState>;

  // 外部リンクを開く
  openExternal: (url: string) => Promise<boolean>;

  // 許可されたNASパスをエクスプローラーで開く
  openNasPath: (path: string) => Promise<boolean>;

  // 通知設定変更のリスナー
  onNotificationSettingsChanged: (callback: (settings: NotificationSettings) => void) => () => void;

  // ルーム遷移のリスナー
  onNavigateToRoom: (callback: (roomId: string) => void) => () => void;

  // 予定遷移のリスナー
  onNavigateToSchedule: (callback: (scheduleId: string) => void) => () => void;

  onNavigateToChatList: (callback: () => void) => () => void;
  onWindowControlsStateChanged: (callback: (state: WindowControlsState) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
