// Electron メインプロセス
import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
  dialog,
  screen,
  nativeTheme
} from 'electron';
import path from 'path';
import fs from 'fs';
import { autoUpdater } from 'electron-updater';

// 設定ストアの型
interface StoreSchema {
  notificationSettings: {
    enableNotifications: boolean;
    showMessageContent: boolean;
    notifyActiveRoom: boolean;
  };
  alwaysOnTop: boolean;
  // アプリのテーマ（タイトルバーの明暗をOSに連動させるために保持）
  theme: 'light' | 'dark';
}

// 通知アイテムの型
interface NotificationItem {
  id: number;
  title: string;
  body: string;
  roomId?: string;
  kind?: 'chat' | 'schedule';
  timestamp: Date;
}

// シンプルな設定ストア実装
class SimpleStore {
  private filePath: string;
  private data: StoreSchema;
  private defaults: StoreSchema = {
    notificationSettings: {
      enableNotifications: true,
      showMessageContent: true,
      notifyActiveRoom: false
    },
    alwaysOnTop: false,
    theme: 'light'
  };

  constructor() {
    const userDataPath = app.getPath('userData');
    this.filePath = path.join(userDataPath, 'config.json');
    this.data = this.load();
  }

  private load(): StoreSchema {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(content);
        return {
          ...this.defaults,
          ...parsed,
          notificationSettings: {
            ...this.defaults.notificationSettings,
            ...parsed.notificationSettings
          }
        };
      }
    } catch (error) {
      console.error('設定ファイル読み込みエラー:', error);
    }
    return { ...this.defaults };
  }

  private save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('設定ファイル書き込みエラー:', error);
    }
  }

  get<K extends keyof StoreSchema>(key: K): StoreSchema[K] {
    return this.data[key];
  }

  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void {
    this.data[key] = value;
    this.save();
  }
}

// 通知マネージャークラス（1つの通知欄にメッセージを追加していく形式）
class NotificationManager {
  private notifications: NotificationItem[] = [];
  private containerWindow: BrowserWindow | null = null;
  private nextId: number = 1;
  private readonly MAX_NOTIFICATIONS = 10;
  private readonly NOTIF_WIDTH = 350;
  private readonly HEADER_HEIGHT = 50; // ヘッダー部分
  private readonly FOOTER_HEIGHT = 68; // OKボタン部分
  private readonly ITEM_HEIGHT = 55; // 各メッセージの高さ
  private readonly SCHEDULE_ITEM_HEIGHT = 84; // 予定通知は種別バッジ分だけ高くする
  private readonly MAX_HEIGHT = 500;
  private readonly PADDING = 10;

  addNotification(title: string, body: string, roomId?: string, kind: 'chat' | 'schedule' = 'chat'): void {
    // H-11: 古い通知（5 分超過）を自動的に間引く
    this.pruneOldNotifications(5 * 60 * 1000);

    const notification: NotificationItem = {
      id: this.nextId++,
      title,
      body,
      roomId,
      kind,
      timestamp: new Date()
    };

    // 最大数を超えたら古いものを削除
    if (this.notifications.length >= this.MAX_NOTIFICATIONS) {
      this.notifications.shift();
    }

    this.notifications.push(notification);
    this.updateUI();
  }

  /**
   * H-11: 指定時間より古い通知を破棄する。
   * UI 更新は呼び出し側に任せる（addNotification や明示的な復元時に使う）。
   */
  pruneOldNotifications(maxAgeMs: number): void {
    const now = Date.now();
    const before = this.notifications.length;
    this.notifications = this.notifications.filter(
      (n) => now - n.timestamp.getTime() <= maxAgeMs
    );
    if (this.notifications.length !== before) {
      if (this.notifications.length === 0) {
        this.closeWindow();
      } else {
        this.updateUI();
      }
    }
  }

  clearAll(): void {
    this.notifications = [];
    this.closeWindow();
  }

  private closeWindow(): void {
    if (this.containerWindow && !this.containerWindow.isDestroyed()) {
      this.containerWindow.close();
    }
    this.containerWindow = null;
    this.notifications = []; // ウィンドウを閉じたら通知リストもクリア
  }

  private calculateWindowHeight(): number {
    if (this.notifications.length === 0) return 0;
    // ヘッダー + メッセージリスト + フッター（OKボタン）
    const itemsHeight = this.notifications.reduce(
      (sum, notification) => sum + (notification.kind === 'schedule' ? this.SCHEDULE_ITEM_HEIGHT : this.ITEM_HEIGHT),
      0
    );
    const contentHeight = this.HEADER_HEIGHT + itemsHeight + this.FOOTER_HEIGHT;
    return Math.min(contentHeight, this.MAX_HEIGHT);
  }

  private updateUI(): void {
    if (this.notifications.length === 0) {
      this.closeWindow();
      return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;
    const windowHeight = this.calculateWindowHeight();

    // ウィンドウが存在しない場合は作成
    if (!this.containerWindow || this.containerWindow.isDestroyed()) {
      this.containerWindow = new BrowserWindow({
        width: this.NOTIF_WIDTH,
        height: windowHeight,
        x: workArea.x + workArea.width - this.NOTIF_WIDTH - this.PADDING,
        y: workArea.y + workArea.height - windowHeight - this.PADDING,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        focusable: true,
        show: false,
        transparent: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'notificationPreload.js')
        }
      });

      this.containerWindow.once('ready-to-show', () => {
        this.containerWindow?.show();
      });

      this.containerWindow.on('closed', () => {
        this.containerWindow = null;
        this.notifications = []; // ウィンドウが閉じられたら通知もクリア
      });
    } else {
      // ウィンドウサイズと位置を更新
      this.containerWindow.setBounds({
        x: workArea.x + workArea.width - this.NOTIF_WIDTH - this.PADDING,
        y: workArea.y + workArea.height - windowHeight - this.PADDING,
        width: this.NOTIF_WIDTH,
        height: windowHeight
      });
    }

    // HTMLコンテンツを更新
    const htmlContent = this.generateHTML();
    this.containerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  }

  private generateHTML(): string {
    const notificationsJson = JSON.stringify(this.notifications.map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
      roomId: n.roomId || '',
      kind: n.kind || 'chat'
    }))).replace(/</g, '\\u003c');

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', 'Yu Gothic UI', sans-serif;
          background: transparent;
          overflow: hidden;
        }
        .notification-panel {
          width: 100%;
          height: 100%;
          background: #ffffff;
          border-radius: 12px;
          color: #1f2937;
          border: 1px solid rgba(15, 23, 42, 0.12);
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.24);
          display: flex;
          flex-direction: column;
          animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .panel-header {
          padding: 12px 16px;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .panel-title {
          font-size: 13px;
          font-weight: 600;
          color: #111827;
        }
        .panel-badge {
          background: #2563eb;
          color: #ffffff;
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 10px;
        }
        .message-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }
        .message-list::-webkit-scrollbar {
          width: 4px;
        }
        .message-list::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.7);
          border-radius: 2px;
        }
        .message-item {
          padding: 8px 10px;
          background: #eef5ff;
          color: #17325f;
          border: 1px solid rgba(47, 125, 225, 0.18);
          border-left: 4px solid #2f7de1;
          border-radius: 8px;
          margin-bottom: 6px;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
        }
        .message-item:hover {
          background: #e3efff;
          border-color: rgba(47, 125, 225, 0.28);
        }
        .message-item.schedule {
          background: #fff4df;
          color: #4f3421;
          border: 1px solid rgba(115, 83, 42, 0.16);
          border-left: 4px solid #b9822f;
        }
        .message-item.schedule:hover {
          background: #ffeed1;
        }
        .message-item:last-child {
          margin-bottom: 0;
        }
        .message-kind {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          width: fit-content;
          margin-bottom: 4px;
          padding: 2px 6px;
          border-radius: 999px;
          background: rgba(126, 87, 34, 0.12);
          color: #7a5323;
          font-size: 10px;
          font-weight: 700;
        }
        .message-sender {
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .message-text {
          font-size: 11px;
          opacity: 0.9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .panel-footer {
          flex: 0 0 auto;
          padding: 10px 16px 12px;
          border-top: 1px solid #e5e7eb;
        }
        .btn {
          width: 100%;
          padding: 10px;
          border: 1px solid #d8d6d0;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          background: #f7f7f5;
          color: #37352f;
          transition: background 0.2s;
        }
        .btn:hover {
          background: #efeeeb;
        }
      </style>
    </head>
    <body>
      <div class="notification-panel">
        <div class="panel-header">
          <span class="panel-title">ArticsChat</span>
          <span class="panel-badge">${this.notifications.length}件</span>
        </div>
        <div class="message-list" id="messageList"></div>
        <div class="panel-footer">
          <button class="btn" id="okBtn">OK</button>
        </div>
      </div>
      <script type="application/json" id="notificationData">${notificationsJson}</script>
      <script>
        const notifications = JSON.parse(document.getElementById('notificationData').textContent || '[]');

        // メッセージリストを描画
        const messageList = document.getElementById('messageList');
        notifications.forEach(notif => {
          const item = document.createElement('div');
          item.className = notif.kind === 'schedule' ? 'message-item schedule' : 'message-item';
          if (notif.kind === 'schedule') {
            const kind = document.createElement('div');
            kind.className = 'message-kind';
            kind.textContent = '📅 行動予定表';
            item.appendChild(kind);
          }
          const sender = document.createElement('div');
          sender.className = 'message-sender';
          sender.textContent = notif.title;
          const body = document.createElement('div');
          body.className = 'message-text';
          body.textContent = notif.body;
          item.appendChild(sender);
          item.appendChild(body);
          item.onclick = () => {
            if (notif.roomId && window.notificationAPI) {
              window.notificationAPI.openRoom(notif.roomId);
            } else if (window.notificationAPI) {
              window.notificationAPI.openMainWindow();
            }
            window.notificationAPI.clearAll();
          };
          messageList.appendChild(item);
        });

        // OKボタンで全ての通知をクリア
        document.getElementById('okBtn').onclick = () => {
          if (window.notificationAPI) {
            window.notificationAPI.clearAll();
          }
        };

        // M-32: Esc キーで通知パネルを閉じる
        window.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && window.notificationAPI) {
            e.preventDefault();
            window.notificationAPI.clearAll();
          }
        });
      </script>
    </body>
    </html>
    `;
  }
}

let store: SimpleStore;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let notificationManager: NotificationManager;

const ALLOWED_NAS_PREFIXES = ['\\\\Nas-1\\', '\\\\Nas-3\\'];

function isAllowedNasPath(targetPath: string): boolean {
  return ALLOWED_NAS_PREFIXES.some((prefix) =>
    targetPath.toLowerCase().startsWith(prefix.toLowerCase())
  );
}

// 開発モードかどうか
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

const ALLOWED_EXTERNAL_PROTOCOLS = ['https:', 'http:', 'mailto:'];

async function openExternalUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.includes(parsed.protocol)) {
      console.warn('ブロックされたURL:', url);
      return false;
    }

    await shell.openExternal(url);
    return true;
  } catch (error) {
    console.error('外部URLを開けませんでした:', url, error);
    return false;
  }
}

function isAppNavigationUrl(url: string, devServerUrl: string): boolean {
  if (url === 'about:blank') return true;
  if (isDev) {
    return url.startsWith(devServerUrl);
  }
  return url.startsWith('file://');
}

const ELECTRON_ENTRY_HASH = '/schedule';

function getDevServerEntryUrl(devServerUrl: string): string {
  try {
    const url = new URL(devServerUrl);
    url.hash = ELECTRON_ENTRY_HASH;
    return url.toString();
  } catch {
    const baseUrl = devServerUrl.replace(/[#?].*$/, '').replace(/\/$/, '');
    return `${baseUrl}/#${ELECTRON_ENTRY_HASH}`;
  }
}

async function showMessageBoxWithMainWindow(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    return dialog.showMessageBox(mainWindow, options);
  }

  return dialog.showMessageBox(options);
}

// 保存されたテーマを Windows のタイトルバー（ネイティブ枠）に反映する。
// nativeTheme.themeSource を 'dark' にすると、OS 標準のタイトルバーが
// ダーク描画（黒系）になる。レイアウトには影響しない。
function applyTitleBarTheme(theme: 'light' | 'dark') {
  nativeTheme.themeSource = theme;
}

function createWindow() {
  // 起動時、保存済みテーマをタイトルバーへ即時反映（ウィンドウ生成前に行う）
  applyTitleBarTheme(store.get('theme'));

  // アイコンパスの設定
  const iconPath = isDev
    ? path.join(__dirname, '../public/favicon.png')
    : path.join(process.resourcesPath, 'favicon.png');

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 580,
    minHeight: 500,
    resizable: true,
    icon: iconPath,
    autoHideMenuBar: true, // メニューバーを自動で隠す
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false // 最初は非表示
  });

  // メニューバーを完全に削除
  mainWindow.setMenuBarVisibility(false);
  Menu.setApplicationMenu(null);

  // 開発モードではdevサーバー、本番ではビルドされたファイルを読み込む
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  if (isDev) {
    // 開発サーバーのポートを動的に取得
    mainWindow.loadURL(getDevServerEntryUrl(devServerUrl));
    if (process.env.ARTICS_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    // 本番ビルド: app.asar内のdist/index.html読み込む
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: ELECTRON_ENTRY_HASH });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppNavigationUrl(url, devServerUrl)) return;
    event.preventDefault();
    void openExternalUrl(url);
  });

  // ウィンドウの準備ができたら表示
  mainWindow.once('ready-to-show', () => {
    // --hidden引数がある場合は非表示のまま
    if (!process.argv.includes('--hidden')) {
      mainWindow?.show();
    }
    // 保存された「常に手前に表示」設定を反映
    if (store.get('alwaysOnTop')) {
      mainWindow?.setAlwaysOnTop(true);
    }
  });

  // 閉じるボタンをクリックした時、アプリを終了せずトレイに常駐
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // H-11: メインウィンドウが表示されたら通知パネルをクリア
  // （focus ではなく show を使う理由: 別ウィンドウから戻った瞬間に消えるのを防ぐ）
  mainWindow.on('show', () => {
    notificationManager?.clearAll();
  });

}

function createTray() {
  // トレイアイコンを作成
  const iconPath = isDev
    ? path.join(__dirname, '../public/favicon.png')
    : path.join(process.resourcesPath, 'favicon.png');

  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // アイコンが見つからない場合はデフォルトアイコンを作成
      icon = nativeImage.createEmpty();
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  updateTrayMenu();

  tray.setToolTip('ArticsChat');

  // ダブルクリックでウィンドウを表示
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const notificationSettings = store.get('notificationSettings');

  // 右クリックメニュー
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'ArticsChat を開く',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    { type: 'separator' },
    {
      label: `バージョン ${app.getVersion()}`,
      enabled: false
    },
    {
      label: 'アップデートを確認',
      click: () => {
        if (!isDev) {
          autoUpdater.checkForUpdates().then((result) => {
            if (!result || !result.updateInfo) {
              void showMessageBoxWithMainWindow({
                type: 'info',
                title: 'アップデート確認',
                message: '最新版を使用しています',
                buttons: ['OK']
              });
            }
          }).catch((error) => {
            console.error('アップデート確認エラー:', error);
            void showMessageBoxWithMainWindow({
              type: 'error',
              title: 'エラー',
              message: 'アップデートの確認に失敗しました',
              buttons: ['OK']
            });
          });
        } else {
          void showMessageBoxWithMainWindow({
            type: 'info',
            title: '開発モード',
            message: '開発モードではアップデート確認は無効です',
            buttons: ['OK']
          });
        }
      }
    },
    { type: 'separator' },
    {
      label: '通知設定',
      submenu: [
        {
          label: '通知を有効にする',
          type: 'checkbox',
          checked: notificationSettings.enableNotifications,
          click: (menuItem) => {
            const newSettings = {
              ...store.get('notificationSettings'),
              enableNotifications: menuItem.checked
            };
            store.set('notificationSettings', newSettings);
            mainWindow?.webContents.send('notification-settings-changed', newSettings);
            updateTrayMenu();
          }
        },
        {
          label: 'メッセージ内容を表示',
          type: 'checkbox',
          checked: notificationSettings.showMessageContent,
          click: (menuItem) => {
            const newSettings = {
              ...store.get('notificationSettings'),
              showMessageContent: menuItem.checked
            };
            store.set('notificationSettings', newSettings);
            mainWindow?.webContents.send('notification-settings-changed', newSettings);
            updateTrayMenu();
          }
        },
        {
          label: 'すべてのメッセージを通知',
          type: 'checkbox',
          checked: notificationSettings.notifyActiveRoom,
          enabled: notificationSettings.enableNotifications,
          click: (menuItem) => {
            const newSettings = {
              ...store.get('notificationSettings'),
              notifyActiveRoom: menuItem.checked
            };
            store.set('notificationSettings', newSettings);
            mainWindow?.webContents.send('notification-settings-changed', newSettings);
            updateTrayMenu();
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: '終了',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// IPC ハンドラー
function setupIPC() {
  // 通知ウィンドウからメインウィンドウを開く
  ipcMain.on('open-main-window', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // 通知ウィンドウを閉じる（IPC経由で確実に閉じる）
  ipcMain.on('close-notification', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });

  // 特定のチャットルームを開く
  ipcMain.on('open-room', (_event, roomId: string) => {
    mainWindow?.show();
    mainWindow?.focus();
    // レンダラープロセスにルーム遷移イベントを送信
    mainWindow?.webContents.send('navigate-to-room', roomId);
  });

  // 全ての通知をクリアしてウィンドウを閉じる
  ipcMain.on('clear-all-notifications', () => {
    notificationManager.clearAll();
  });

  // アプリバージョンを取得
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  // アップデートを確認
  ipcMain.handle('check-for-updates', async () => {
    if (isDev) {
      return { available: false, isDev: true };
    }

    try {
      const result = await autoUpdater.checkForUpdates();
      if (result && result.updateInfo) {
        const currentVersion = app.getVersion();
        const latestVersion = result.updateInfo.version;
        // バージョン比較
        if (latestVersion !== currentVersion) {
          return { available: true, version: latestVersion };
        }
      }
      return { available: false };
    } catch (error) {
      console.error('アップデート確認エラー:', error);
      return { available: false, error: true };
    }
  });

  // 通知設定を取得
  ipcMain.handle('get-notification-settings', () => {
    return store.get('notificationSettings');
  });

  // 通知設定を更新
  ipcMain.handle('set-notification-settings', (_event, settings: StoreSchema['notificationSettings']) => {
    store.set('notificationSettings', settings);
    updateTrayMenu();
    mainWindow?.webContents.send('notification-settings-changed', settings);
    return true;
  });

  // 通知を表示（NotificationManagerを使用）
  ipcMain.handle('show-notification', (_event, options: { title: string; body: string; roomId?: string; kind?: 'chat' | 'schedule' }) => {
    const settings = store.get('notificationSettings');

    if (!settings.enableNotifications) {
      return false;
    }

    const body = settings.showMessageContent ? options.body : 'メッセージが届きました';
    notificationManager.addNotification(options.title, body, options.roomId, options.kind);
    return true;
  });

  // 常に手前に表示の状態を取得
  ipcMain.handle('get-always-on-top', () => {
    return store.get('alwaysOnTop');
  });

  // 常に手前に表示を設定
  ipcMain.handle('set-always-on-top', (_event, value: boolean) => {
    store.set('alwaysOnTop', value);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(value);
    }
    return true;
  });

  // タイトルバーのテーマ（明暗）を設定。アプリ側のライト/ダーク切替に追従する
  ipcMain.handle('set-titlebar-theme', (_event, theme: 'light' | 'dark') => {
    const normalized: 'light' | 'dark' = theme === 'dark' ? 'dark' : 'light';
    store.set('theme', normalized);
    applyTitleBarTheme(normalized);
    return true;
  });

  // Electron環境かどうかを確認
  ipcMain.handle('is-electron', () => {
    return true;
  });

  // 外部リンクをデフォルトブラウザで開く（URL検証付き）
  ipcMain.handle('open-external', async (_event, url: string) => {
    return openExternalUrl(url);
  });

  // 許可済みNASパスをエクスプローラー/関連アプリで開く
  ipcMain.handle('open-nas-path', async (_event, targetPath: string) => {
    try {
      const normalizedPath = targetPath.trim().replace(/\//g, '\\');

      if (!isAllowedNasPath(normalizedPath)) {
        console.warn('ブロックされたNASパス:', targetPath);
        return false;
      }

      const errorMessage = await shell.openPath(normalizedPath);
      if (errorMessage) {
        console.error('NASパスを開けませんでした:', normalizedPath, errorMessage);
        return false;
      }

      return true;
    } catch (error) {
      console.error('NASパスを開く処理でエラー:', targetPath, error);
      return false;
    }
  });
}

// 自動アップデートのセットアップ
function setupAutoUpdater() {
  // 開発モードではスキップ
  if (isDev) {
    console.log('開発モードのため自動アップデートをスキップ');
    return;
  }

  // ログを有効化
  autoUpdater.logger = console;

  // アップデートが利用可能な場合
  autoUpdater.on('update-available', (info) => {
    console.log('アップデートが利用可能:', info.version);
    void showMessageBoxWithMainWindow({
      type: 'info',
      title: 'ArticsChat アップデートのお知らせ',
      message: `ArticsChat の新しいバージョン (${info.version}) が利用可能です`,
      detail: 'バックグラウンドでダウンロードを開始します。完了後にお知らせします。',
      buttons: ['OK']
    });
  });

  // アップデートがない場合
  autoUpdater.on('update-not-available', () => {
    console.log('アップデートはありません（最新版です）');
  });

  // ダウンロード進捗
  autoUpdater.on('download-progress', (progress) => {
    console.log(`ダウンロード中: ${Math.round(progress.percent)}%`);
    mainWindow?.setProgressBar(progress.percent / 100);
  });

  // ダウンロード完了
  autoUpdater.on('update-downloaded', (info) => {
    console.log('アップデートのダウンロード完了:', info.version);
    mainWindow?.setProgressBar(-1); // プログレスバーを消す

    const showUpdatePrompt = () => {
      showMessageBoxWithMainWindow({
        type: 'info',
        title: 'ArticsChat アップデート準備完了',
        message: `ArticsChat バージョン ${info.version} のインストール準備ができました`,
        detail: '今すぐ再起動してアップデートを適用しますか？',
        buttons: ['今すぐ再起動', '後で'],
        defaultId: 0,
      })
        .then((result) => {
          if (result.response === 0) {
            isQuitting = true;
            autoUpdater.quitAndInstall();
          } else {
            // M-34: 「後で」を選んだら 24 時間後に再度プロンプトを出す
            setTimeout(showUpdatePrompt, 24 * 60 * 60 * 1000);
            console.log('[autoUpdater] 24 時間後に再促しします');
          }
        });
    };

    showUpdatePrompt();
  });

  // エラー発生時
  autoUpdater.on('error', (error) => {
    console.error('自動アップデートエラー:', error);
  });

  // アップデートをチェック
  autoUpdater.checkForUpdates().catch((error) => {
    console.error('アップデートチェックエラー:', error);
  });
}

// 単一インスタンス制御
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 既に別のインスタンスが起動している場合は終了
  app.quit();
} else {
  // 2番目のインスタンスが起動しようとした時
  app.on('second-instance', () => {
    // 既存のウィンドウをフォーカス
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // アプリ起動時
  app.whenReady().then(() => {
    // ストアを初期化
    store = new SimpleStore();

    // 通知マネージャーを初期化
    notificationManager = new NotificationManager();

    // 起動時に現在のログイン設定をログ出力
    if (app.isPackaged) {
      const loginSettings = app.getLoginItemSettings();
      console.log('[起動時] ログイン設定:', loginSettings);
    }

    createWindow();
    createTray();
    setupIPC();
    setupAutoUpdater(); // 自動アップデートをセットアップ

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        mainWindow?.show();
      }
    });
  });
}

// 全ウィンドウが閉じられた時（macOS以外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // トレイに常駐するので何もしない
  }
});

// アプリ終了前
app.on('before-quit', () => {
  isQuitting = true;
});
