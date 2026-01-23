// Electron メインプロセス
import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  Notification,
  shell,
  dialog
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

let store: SimpleStore;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let notificationWindows: BrowserWindow[] = [];

// 開発モードかどうか
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// カスタム通知ウィンドウを作成
function showCustomNotification(title: string, body: string) {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const notifWidth = 350;
  const notifHeight = 120;
  const padding = 10;

  // 既存の通知ウィンドウの数に応じて位置を調整（下から上に積み上げる）
  const yOffset = notificationWindows.length * (notifHeight + padding);

  const notifWindow = new BrowserWindow({
    width: notifWidth,
    height: notifHeight,
    x: width - notifWidth - padding,
    y: height - notifHeight - padding - yOffset,
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

  // 「開く」ボタンが押されたかどうかのフラグ
  let shouldOpenMainWindow = false;

  // 通知のHTMLコンテンツ
  const htmlContent = `
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
        .notification {
          background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%);
          border-radius: 12px;
          padding: 16px;
          color: white;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          height: 100%;
          display: flex;
          flex-direction: column;
          animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .title {
          font-size: 14px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }
        .app-name {
          font-size: 11px;
          opacity: 0.8;
        }
        .body {
          font-size: 13px;
          line-height: 1.4;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }
        .btn {
          flex: 1;
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-primary {
          background: white;
          color: #1a73e8;
        }
        .btn-primary:hover {
          background: #f0f0f0;
        }
        .btn-secondary {
          background: rgba(255,255,255,0.2);
          color: white;
        }
        .btn-secondary:hover {
          background: rgba(255,255,255,0.3);
        }
      </style>
    </head>
    <body>
      <div class="notification">
        <div class="header">
          <span class="title">${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
          <span class="app-name">Artics</span>
        </div>
        <div class="body">${body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        <div class="actions">
          <button class="btn btn-primary" id="openBtn">開く</button>
          <button class="btn btn-secondary" id="closeBtn">OK</button>
        </div>
      </div>
      <script>
        document.getElementById('openBtn').addEventListener('click', () => {
          if (window.notificationAPI) {
            window.notificationAPI.openMainWindow();
          }
          window.close();
        });
        document.getElementById('closeBtn').addEventListener('click', () => {
          window.close();
        });
      </script>
    </body>
    </html>
  `;

  notifWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  notifWindow.once('ready-to-show', () => {
    notifWindow.show();
  });

  // ウィンドウが閉じられたらリストから削除
  notifWindow.on('closed', () => {
    const index = notificationWindows.indexOf(notifWindow);
    if (index > -1) {
      notificationWindows.splice(index, 1);
    }
    // 残りの通知ウィンドウの位置を再調整
    repositionNotificationWindows();
  });

  notificationWindows.push(notifWindow);
}

// 通知ウィンドウの位置を再調整
function repositionNotificationWindows() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const notifWidth = 350;
  const notifHeight = 120;
  const padding = 10;

  notificationWindows.forEach((win, index) => {
    if (!win.isDestroyed()) {
      const yOffset = index * (notifHeight + padding);
      win.setPosition(width - notifWidth - padding, height - notifHeight - padding - yOffset);
    }
  });
}

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

  // 通知を表示（カスタム通知ウィンドウを使用）
  ipcMain.handle('show-notification', (_event, options: { title: string; body: string }) => {
    const settings = store.get('notificationSettings');

    if (!settings.enableNotifications) {
      return false;
    }

    const body = settings.showMessageContent ? options.body : 'メッセージが届きました';
    showCustomNotification(options.title, body);
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
