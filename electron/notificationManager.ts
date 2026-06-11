// カスタム通知ウィンドウの管理。main.ts から機械的に移動（挙動変更なし）。
// 注意: preload パスは __dirname 基準（バンドル後は dist-electron）のため移動の影響なし。

import { BrowserWindow, screen } from 'electron';
import path from 'path';

// 通知アイテムの型
interface NotificationItem {
  id: number;
  title: string;
  body: string;
  roomId?: string;
  kind?: 'chat' | 'schedule';
  timestamp: Date;
}

// 通知マネージャークラス（1つの通知欄にメッセージを追加していく形式）
export class NotificationManager {
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
