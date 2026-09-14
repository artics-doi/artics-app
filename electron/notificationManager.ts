// カスタム通知ウィンドウの管理。main.ts から機械的に移動（挙動変更なし）。
// 注意: preload パスは __dirname 基準（バンドル後は dist-electron）のため移動の影響なし。

import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { generateNotificationHTML, notificationWindowHeight } from './notificationHtml';
import type { NotificationOptions, ProcessNotificationDetails } from './notificationTypes';

// 通知アイテムの型
interface NotificationItem extends NotificationOptions {
  id: number;
  title: string;
  body: string;
  roomId?: string;
  scheduleId?: string;
  timestamp: Date;
}

// 通知マネージャークラス（1つの通知欄にメッセージを追加していく形式）
export class NotificationManager {
  private notifications: NotificationItem[] = [];
  private containerWindow: BrowserWindow | null = null;
  private nextId: number = 1;
  private readonly MAX_NOTIFICATIONS = 10;
  private readonly NOTIF_WIDTH = 350;
  private readonly PADDING = 10;

  addNotification(title: string, body: string, roomId?: string, kind: NotificationOptions['kind'] = 'chat', scheduleId?: string, process?: ProcessNotificationDetails): void {
    // H-11: 古い通知（5 分超過）を自動的に間引く
    this.pruneOldNotifications(5 * 60 * 1000);

    const notification: NotificationItem = {
      id: this.nextId++,
      title,
      body,
      roomId,
      scheduleId,
      kind,
      process,
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
    return notificationWindowHeight(this.notifications, screen.getPrimaryDisplay().workArea.height - this.PADDING * 2);
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
    void this.containerWindow
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`)
      .then(() => {
        if (!this.containerWindow || this.containerWindow.isDestroyed()) return;
        // 通知を連続追加すると先行navigationが中断されるため、最新内容の読込完了後に表示する。
        this.containerWindow.showInactive();
        this.containerWindow.moveTop();
      })
      .catch((error: unknown) => {
        const code = (error as { code?: string }).code;
        // 次の通知によるnavigation差し替えは正常系。最新のloadURL側で表示される。
        if (code !== 'ERR_ABORTED') {
          console.error('通知ウィンドウの表示に失敗しました:', error);
        }
      });
  }

  private generateHTML(): string {
    return generateNotificationHTML(this.notifications);
  }
}
