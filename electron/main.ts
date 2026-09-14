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
  nativeTheme,
  screen,
} from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';

import { SimpleStore, type StoreSchema } from './store';
import { NotificationManager } from './notificationManager';
import { parseProcessNotification, type NotificationOptions } from './notificationTypes';
import {
  ELECTRON_ENTRY_HASH,
  getDevServerEntryUrl,
  isAllowedNasPath,
  isAppNavigationUrl,
  isDev,
  openExternalUrl,
} from './navigationPolicies';
import { getCompactChatWindowBounds, getWorkspaceWindowBounds, type WindowBounds } from './workspaceWindow';

let store: SimpleStore;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let notificationManager: NotificationManager;
let unreadBadgeCount = 0;
let unreadBadgeIconDataUrl: string | null = null;
let chatCompactMode = false;
let chatCompactRestoreBounds: WindowBounds | null = null;
let chatCompactRestoreMaximized = false;

// コンパクトなチャット一覧が崩れずに使える最小幅。
// Web側の最小幅（320px）より余裕を持たせ、ナビゲーション3列の可読性を保つ。
const MAIN_WINDOW_MIN_WIDTH = 420;

function getWindowControlsState() {
  return {
    maximized: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized()),
    compact: chatCompactMode,
  };
}

function sendWindowControlsState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('window-controls-state-changed', getWindowControlsState());
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

// タスクバーの未読バッジを反映する。
// Windows の app.setBadgeCount は無効なので、タスクバーボタンのオーバーレイアイコンを使う。
// タスクバーボタンは非表示（トレイ常駐）→再表示でオーバーレイが消えるため、show 時に再適用する。
function applyUnreadBadge() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    if (process.platform === 'win32') {
      if (unreadBadgeCount > 0 && unreadBadgeIconDataUrl) {
        const image = nativeImage.createFromDataURL(unreadBadgeIconDataUrl);
        if (!image.isEmpty()) {
          mainWindow.setOverlayIcon(image, `${unreadBadgeCount}件の未読メッセージ`);
          return;
        }
      }
      mainWindow.setOverlayIcon(null, '');
    } else {
      app.setBadgeCount(unreadBadgeCount);
    }
  } catch (error) {
    console.error('タスクバーバッジの適用に失敗:', error);
  }
}

function createWindow() {
  // 起動時、保存済みテーマをタイトルバーへ即時反映（ウィンドウ生成前に行う）
  applyTitleBarTheme(store.get('theme'));

  // アイコンパスの設定
  const iconPath = isDev
    ? path.join(__dirname, '../public/favicon.png')
    : path.join(process.resourcesPath, 'favicon.png');

  mainWindow = new BrowserWindow({
    title: 'Artics',
    width: 1600,
    height: 950,
    minWidth: MAIN_WINDOW_MIN_WIDTH,
    minHeight: 500,
    resizable: true,
    icon: iconPath,
    frame: false,
    backgroundColor: store.get('theme') === 'dark' ? '#20202f' : '#ffffff',
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
    applyUnreadBadge();
  });

  // 閉じるボタンをクリックした時、アプリを終了せずトレイに常駐
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // 破棄済みウィンドウへの show/focus は例外になるため、参照を残さない
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('maximize', () => {
    chatCompactMode = false;
    sendWindowControlsState();
  });
  mainWindow.on('unmaximize', sendWindowControlsState);

  // H-11: メインウィンドウが表示されたら通知パネルをクリア
  // （focus ではなく show を使う理由: 別ウィンドウから戻った瞬間に消えるのを防ぐ）
  mainWindow.on('show', () => {
    notificationManager?.clearAll();
    applyUnreadBadge();
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  ipcMain.handle('get-window-controls-state', () => getWindowControlsState());

  ipcMain.handle('window-minimize', () => {
    mainWindow?.minimize();
    return true;
  });

  ipcMain.handle('window-toggle-maximize', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return getWindowControlsState();
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      chatCompactMode = false;
      mainWindow.maximize();
    }
    sendWindowControlsState();
    return getWindowControlsState();
  });

  ipcMain.handle('window-close', () => {
    mainWindow?.close();
    return true;
  });

  ipcMain.handle('toggle-chat-compact', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return getWindowControlsState();

    if (chatCompactMode) {
      chatCompactMode = false;
      const restoreBounds = chatCompactRestoreBounds;
      const restoreMaximized = chatCompactRestoreMaximized;
      chatCompactRestoreBounds = null;
      chatCompactRestoreMaximized = false;
      if (restoreBounds) {
        mainWindow.setBounds(restoreBounds, true);
      }
      if (restoreMaximized) mainWindow.maximize();
    } else {
      chatCompactRestoreMaximized = mainWindow.isMaximized();
      chatCompactRestoreBounds = chatCompactRestoreMaximized
        ? mainWindow.getNormalBounds()
        : mainWindow.getBounds();
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      const currentBounds = mainWindow.getBounds();
      const workArea = screen.getDisplayMatching(currentBounds).workArea;
      mainWindow.setBounds(getCompactChatWindowBounds(currentBounds, workArea), true);
      chatCompactMode = true;
      mainWindow.webContents.send('navigate-to-chat-list');
    }

    // タイトルバー上の操作なのでウィンドウは既に表示中。
    // show() は「画面を表示したら通知を消す」処理を発火させるため呼ばない。
    mainWindow.focus();
    sendWindowControlsState();
    return getWindowControlsState();
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      // レンダラープロセスにルーム遷移イベントを送信
      mainWindow.webContents.send('navigate-to-room', roomId);
    }
  });

  // 予定通知から該当予定を開く
  ipcMain.on('open-schedule', (_event, scheduleId: string) => {
    if (!scheduleId || !mainWindow || mainWindow.isDestroyed()) return;

    if (!mainWindow.isMaximized()) {
      const currentBounds = mainWindow.getBounds();
      const workArea = screen.getDisplayMatching(currentBounds).workArea;
      const nextBounds = getWorkspaceWindowBounds(currentBounds, workArea);
      mainWindow.setBounds(nextBounds, true);
    }

    chatCompactMode = false;
    sendWindowControlsState();

    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('navigate-to-schedule', scheduleId);
  });

  // 全ての通知をクリアしてウィンドウを閉じる
  ipcMain.on('open-process-task', (_event, target: { projectId?: unknown; taskId?: unknown }) => {
    if (!target || typeof target.projectId !== 'string' || !target.projectId || target.projectId.includes('/')
      || typeof target.taskId !== 'string' || !target.taskId || target.taskId.includes('/')
      || !mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isMaximized()) {
      const bounds = mainWindow.getBounds();
      mainWindow.setBounds(getWorkspaceWindowBounds(bounds, screen.getDisplayMatching(bounds).workArea));
    }
    chatCompactMode = false;
    sendWindowControlsState();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('navigate-to-process-task', target);
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
  ipcMain.handle('show-notification', (_event, options: NotificationOptions) => {
    const settings = store.get('notificationSettings');

    if (!settings.enableNotifications) {
      return false;
    }

    const process = options.kind === 'process' ? parseProcessNotification(options.process) : undefined;
    if (options.kind === 'process' && !process) return false;
    const body = settings.showMessageContent ? options.body : 'メッセージが届きました';
    // 内容非表示時は、工程名・タスク名・変更者・状態も伏せる。移動先のIDは保持する。
    const visibleProcess = process && !settings.showMessageContent
      ? { ...process, projectName: '', previousStatus: '', nextStatus: '', actorName: '', occurredAt: '' }
      : process;
    const title = process && !settings.showMessageContent ? '工程管理の更新があります' : options.title;
    notificationManager.addNotification(title, body, options.roomId, options.kind, options.scheduleId, visibleProcess);
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

  // タスクバーの未読件数バッジを更新
  ipcMain.handle('set-unread-badge', (_event, count: number, iconDataUrl: string | null) => {
    unreadBadgeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    unreadBadgeIconDataUrl = unreadBadgeCount > 0 ? iconDataUrl : null;
    applyUnreadBadge();
    return true;
  });

  // Electron環境かどうかを確認
  ipcMain.handle('is-electron', () => {
    return true;
  });

  // 狭幅のチャット一覧から予定表・工程管理を開く前に、PC用ワークスペース幅を確保する。
  ipcMain.handle('expand-to-workspace', (event) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (!sourceWindow || sourceWindow.isDestroyed()) return false;
    if (sourceWindow.isMaximized()) return true;

    const currentBounds = sourceWindow.getBounds();
    const workArea = screen.getDisplayMatching(currentBounds).workArea;
    const nextBounds = getWorkspaceWindowBounds(currentBounds, workArea);

    if (
      nextBounds.x !== currentBounds.x
      || nextBounds.y !== currentBounds.y
      || nextBounds.width !== currentBounds.width
      || nextBounds.height !== currentBounds.height
    ) {
      sourceWindow.setBounds(nextBounds, true);
    }

    chatCompactMode = false;
    sendWindowControlsState();

    sourceWindow.show();
    sourceWindow.focus();
    return nextBounds.width >= 1024;
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

  // 「後で」の再促しタイマーと表示状態。update-downloaded が再発火しても
  // タイマーとダイアログが多重にならないように一元管理する
  let updatePromptTimer: ReturnType<typeof setTimeout> | null = null;
  let updatePromptShowing = false;

  // ダウンロード完了
  autoUpdater.on('update-downloaded', (info) => {
    console.log('アップデートのダウンロード完了:', info.version);
    mainWindow?.setProgressBar(-1); // プログレスバーを消す

    const showUpdatePrompt = () => {
      if (updatePromptShowing) return;
      updatePromptShowing = true;
      if (updatePromptTimer) {
        clearTimeout(updatePromptTimer);
        updatePromptTimer = null;
      }
      showMessageBoxWithMainWindow({
        type: 'info',
        title: 'ArticsChat アップデート準備完了',
        message: `ArticsChat バージョン ${info.version} のインストール準備ができました`,
        detail: '今すぐ再起動してアップデートを適用しますか？',
        buttons: ['今すぐ再起動', '後で'],
        defaultId: 0,
      })
        .then((result) => {
          updatePromptShowing = false;
          if (result.response === 0) {
            isQuitting = true;
            autoUpdater.quitAndInstall();
          } else {
            // M-34: 「後で」を選んだら 24 時間後に再度プロンプトを出す
            updatePromptTimer = setTimeout(showUpdatePrompt, 24 * 60 * 60 * 1000);
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
  // 通知ウィンドウとトレイを明示的に破棄してから終了する
  notificationManager?.clearAll();
  tray?.destroy();
});
