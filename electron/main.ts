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
  screen
} from 'electron';
import path from 'path';
import fs from 'fs';
import { autoUpdater } from 'electron-updater';

// 設定ストアの型
interface StoreSchema {
  notificationSettings: {
    enableNotifications: boolean;
    showMessageContent: boolean;
  };
  startupEnabled: boolean;
}

// 通知アイテムの型
interface NotificationItem {
  id: number;
  title: string;
  body: string;
  roomId?: string;
  timestamp: Date;
}

// シンプルな設定ストア実装
class SimpleStore {
  private filePath: string;
  private data: StoreSchema;
  private defaults: StoreSchema = {
    notificationSettings: {
      enableNotifications: true,
      showMessageContent: true
    },
    startupEnabled: false
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
        return { ...this.defaults, ...JSON.parse(content) };
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
  private readonly FOOTER_HEIGHT = 60; // OKボタン部分
  private readonly ITEM_HEIGHT = 55; // 各メッセージの高さ
  private readonly MAX_HEIGHT = 500;
  private readonly PADDING = 10;

  addNotification(title: string, body: string, roomId?: string): void {
    const notification: NotificationItem = {
      id: this.nextId++,
      title,
      body,
      roomId,
      timestamp: new Date()
    };

    // 最大数を超えたら古いものを削除
    if (this.notifications.length >= this.MAX_NOTIFICATIONS) {
      this.notifications.shift();
    }

    this.notifications.push(notification);
    this.updateUI();
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
    const contentHeight = this.HEADER_HEIGHT + this.notifications.length * this.ITEM_HEIGHT + this.FOOTER_HEIGHT;
    return Math.min(contentHeight, this.MAX_HEIGHT);
  }

  private updateUI(): void {
    if (this.notifications.length === 0) {
      this.closeWindow();
      return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const windowHeight = this.calculateWindowHeight();

    // ウィンドウが存在しない場合は作成
    if (!this.containerWindow || this.containerWindow.isDestroyed()) {
      this.containerWindow = new BrowserWindow({
        width: this.NOTIF_WIDTH,
        height: windowHeight,
        x: screenWidth - this.NOTIF_WIDTH - this.PADDING,
        y: screenHeight - windowHeight - this.PADDING,
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
        x: screenWidth - this.NOTIF_WIDTH - this.PADDING,
        y: screenHeight - windowHeight - this.PADDING,
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
      roomId: n.roomId || ''
    })));

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
          background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%);
          border-radius: 12px;
          color: white;
          box-shadow: 0 4px 20px rgba(0,0,0,0.25);
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
          border-bottom: 1px solid rgba(255,255,255,0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .panel-title {
          font-size: 13px;
          font-weight: 600;
        }
        .panel-badge {
          background: #ff4444;
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
          background: rgba(255,255,255,0.3);
          border-radius: 2px;
        }
        .message-item {
          padding: 8px 10px;
          background: rgba(255,255,255,0.1);
          border-radius: 8px;
          margin-bottom: 6px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .message-item:hover {
          background: rgba(255,255,255,0.2);
        }
        .message-item:last-child {
          margin-bottom: 0;
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
          padding: 10px 16px;
          border-top: 1px solid rgba(255,255,255,0.2);
        }
        .btn {
          width: 100%;
          padding: 10px;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          background: white;
          color: #1a73e8;
          transition: background 0.2s;
        }
        .btn:hover {
          background: #f0f0f0;
        }
      </style>
    </head>
    <body>
      <div class="notification-panel">
        <div class="panel-header">
          <span class="panel-title">Artics</span>
          <span class="panel-badge">${this.notifications.length}件</span>
        </div>
        <div class="message-list" id="messageList"></div>
        <div class="panel-footer">
          <button class="btn" id="okBtn">OK</button>
        </div>
      </div>
      <script>
        const notifications = ${notificationsJson};

        function escapeHtml(str) {
          const div = document.createElement('div');
          div.textContent = str;
          return div.innerHTML;
        }

        // メッセージリストを描画
        const messageList = document.getElementById('messageList');
        notifications.forEach(notif => {
          const item = document.createElement('div');
          item.className = 'message-item';
          item.innerHTML = \`
            <div class="message-sender">\${escapeHtml(notif.title)}</div>
            <div class="message-text">\${escapeHtml(notif.body)}</div>
          \`;
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

// 開発モードかどうか
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  // アイコンパスの設定
  const iconPath = isDev
    ? path.join(__dirname, '../public/favicon.png')
    : path.join(process.resourcesPath, 'favicon.png');

  mainWindow = new BrowserWindow({
    width: 580,
    height: 800,
    minWidth: 350,
    minHeight: 400,
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
  if (isDev) {
    // 開発サーバーのポートを動的に取得
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devServerUrl);
    // 開発者ツールを開く
    mainWindow.webContents.openDevTools();
  } else {
    // 本番ビルド: app.asar内のdist/index.html読み込む
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // ウィンドウの準備ができたら表示
  mainWindow.once('ready-to-show', () => {
    // --hidden引数がある場合は非表示のまま
    if (!process.argv.includes('--hidden')) {
      mainWindow?.show();
    }
  });

  // 閉じるボタンをクリックした時、アプリを終了せずトレイに常駐
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // 最小化ボタンをクリックした時、トレイに常駐
  mainWindow.on('minimize', () => {
    mainWindow?.hide();
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

  tray.setToolTip('Artics');

  // ダブルクリックでウィンドウを表示
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const notificationSettings = store.get('notificationSettings');
  const startupEnabled = store.get('startupEnabled');

  // 右クリックメニュー
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Artics を開く',
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
              dialog.showMessageBox(mainWindow!, {
                type: 'info',
                title: 'アップデート確認',
                message: '最新版を使用しています',
                buttons: ['OK']
              });
            }
          }).catch((error) => {
            console.error('アップデート確認エラー:', error);
            dialog.showMessageBox(mainWindow!, {
              type: 'error',
              title: 'エラー',
              message: 'アップデートの確認に失敗しました',
              buttons: ['OK']
            });
          });
        } else {
          dialog.showMessageBox(mainWindow!, {
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
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'スタートアップに登録',
      type: 'checkbox',
      checked: startupEnabled,
      click: (menuItem) => {
        store.set('startupEnabled', menuItem.checked);
        setStartup(menuItem.checked);
        updateTrayMenu();
      }
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

function setStartup(enable: boolean) {
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: true,
    args: ['--hidden']
  });
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
    return true;
  });

  // スタートアップ設定を取得
  ipcMain.handle('get-startup-enabled', () => {
    return store.get('startupEnabled');
  });

  // スタートアップ設定を更新
  ipcMain.handle('set-startup-enabled', (_event, enabled: boolean) => {
    store.set('startupEnabled', enabled);
    setStartup(enabled);
    updateTrayMenu();
    return true;
  });

  // 通知を表示（NotificationManagerを使用）
  ipcMain.handle('show-notification', (_event, options: { title: string; body: string; roomId?: string }) => {
    const settings = store.get('notificationSettings');

    if (!settings.enableNotifications) {
      return false;
    }

    const body = settings.showMessageContent ? options.body : 'メッセージが届きました';
    notificationManager.addNotification(options.title, body, options.roomId);
    return true;
  });

  // Electron環境かどうかを確認
  ipcMain.handle('is-electron', () => {
    return true;
  });

  // 外部リンクをデフォルトブラウザで開く
  ipcMain.handle('open-external', (_event, url: string) => {
    shell.openExternal(url);
    return true;
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
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'アップデートのお知らせ',
      message: `新しいバージョン (${info.version}) が利用可能です`,
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

    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'アップデート準備完了',
      message: `バージョン ${info.version} のインストール準備ができました`,
      detail: '今すぐ再起動してアップデートを適用しますか？',
      buttons: ['今すぐ再起動', '後で'],
      defaultId: 0
    }).then((result) => {
      if (result.response === 0) {
        isQuitting = true;
        autoUpdater.quitAndInstall();
      }
    });
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

// アプリ起動時
app.whenReady().then(() => {
  // ストアを初期化
  store = new SimpleStore();

  // 通知マネージャーを初期化
  notificationManager = new NotificationManager();

  createWindow();
  createTray();
  setupIPC();
  setupAutoUpdater(); // 自動アップデートをセットアップ

  // 起動時にスタートアップ設定を適用
  const startupEnabled = store.get('startupEnabled');
  setStartup(startupEnabled);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

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
