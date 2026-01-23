// Electron API の型定義

export interface NotificationSettings {
  enableNotifications: boolean;
  showMessageContent: boolean;
}

export interface ElectronAPI {
  // 通知設定を取得
  getNotificationSettings: () => Promise<NotificationSettings>;

  // 通知設定を更新
  setNotificationSettings: (settings: NotificationSettings) => Promise<boolean>;

  // スタートアップ設定を取得
  getStartupEnabled: () => Promise<boolean>;

  // スタートアップ設定を更新
  setStartupEnabled: (enabled: boolean) => Promise<boolean>;

  // 通知を表示
  showNotification: (options: { title: string; body: string }) => Promise<boolean>;

  // Electron環境かどうかを確認
  isElectron: () => Promise<boolean>;

  // 外部リンクを開く
  openExternal: (url: string) => Promise<boolean>;

  // 通知設定変更のリスナー
  onNotificationSettingsChanged: (callback: (settings: NotificationSettings) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
