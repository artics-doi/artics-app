import type { NotificationDisplayItem } from './notificationTypes';
import { notificationIcons } from './notificationIcons';

export function notificationWindowHeight(items: NotificationDisplayItem[], availableHeight = 600): number {
  if (!items.length) return 0;
  const content = 118 + items.reduce((sum, item) => sum + (item.kind === 'process' ? (item.process?.nextStatus ? 220 : 135) : item.kind === 'schedule' ? 132 : 82), 0);
  return Math.min(content, 600, availableHeight);
}

// Electron本体とローカル表示確認で同じHTMLを使う。外部接続や通知送信は行わない。
export function generateNotificationHTML(notifications: NotificationDisplayItem[]): string {
    const notificationsJson = JSON.stringify(notifications.map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
      roomId: n.roomId || '',
      scheduleId: n.scheduleId || '',
      kind: n.kind || 'chat',
      process: n.process,
    }))).replace(/</g, '\\u003c');

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        html, body { height: 100%; width: 100%; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Noto Sans JP', 'Yu Gothic UI', sans-serif;
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
          font-size: 16px;
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
          min-height: 0;
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
          padding: 9px 10px;
        }
        .message-item.schedule:hover {
          background: #ffeed1;
        }
        .message-item.schedule .message-sender {
          color: #2f2419;
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .message-item.schedule .message-text {
          color: #5c432b;
          font-size: 11px;
          line-height: 1.65;
          white-space: pre-line;
          overflow: visible;
          text-overflow: clip;
        }
        .message-item:last-child {
          margin-bottom: 0;
        }
        .message-item:focus-visible, .panel-close:focus-visible { outline: 2px solid #7755c9; outline-offset: 2px; }
        .message-item.process { background: #f3efff; border: 1px solid #e1d7f5; border-left: 4px solid #8050d5; color: #282035; padding: 12px 13px; }
        .message-item.process:hover { background: #ece4fc; }
        .process-heading { display: flex; align-items: center; gap: 8px; color: #7640c0; margin-bottom: 10px; }
        .process-heading svg { width: 19px; height: 19px; }
        .process-heading span { border-radius: 12px; background: #e6d8fa; padding: 2px 8px; font-size: 10px; font-weight: 700; }
        .process-project { font-size: 11px; color: #706679; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .process .message-sender { font-size: 15px; font-weight: 700; line-height: 1.5; margin-bottom: 12px; }
        .process-transition { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .process-transition svg { width: 17px; height: 17px; flex-shrink: 0; color: #716579; }
        .process-status { display: inline-block; max-width: 130px; padding: 4px 14px; border-radius: 18px; background: #e3e1e8; color: #55515c; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .process-status.next { background: #e2d5f8; color: #6639aa; }
        .process-actor { font-size: 11px; line-height: 1.6; color: #746b7c; overflow-wrap: anywhere; }
        .process-open { border-top: 1px solid #e1d5f3; margin-top: 12px; padding-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: #54465e; }
        .process-open svg { width: 17px; height: 17px; }
        .panel-close { display: inline-flex; align-items: center; justify-content: center; border: 0; background: none; color: #8a8595; padding: 2px; cursor: pointer; margin-left: auto; }
        .panel-close svg { width: 18px; height: 18px; }
        .panel-header { gap: 10px; }
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
        .kind-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
        .kind-heading svg { width: 17px; height: 17px; }
        .kind-heading .message-kind { margin-bottom: 0; }
        .chat-heading { color: #2f7de1; }
        .chat-heading .message-kind { background: #d9e7ff; color: #376bbc; }
        .schedule-heading { color: #99641f; }
        .message-sender {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .message-text {
          font-size: 12px;
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
          <span class="panel-badge">${notifications.length}件</span>
          <button type="button" class="panel-close" id="closeBtn" aria-label="通知を閉じる">${notificationIcons.x}</button>
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
          item.className = notif.kind === 'process' ? 'message-item process' : notif.kind === 'schedule' ? 'message-item schedule' : 'message-item';
          item.tabIndex = 0;
          item.setAttribute('role', 'button');
          item.setAttribute('aria-label', notif.title + ' を確認');
          if (notif.kind !== 'process') {
            const kind = document.createElement('div');
            kind.className = notif.kind === 'schedule' ? 'kind-heading schedule-heading' : 'kind-heading chat-heading';
            kind.innerHTML = notif.kind === 'schedule'
              ? ${JSON.stringify(notificationIcons.calendar + '<span class="message-kind">行動予定表</span>')}
              : ${JSON.stringify(notificationIcons['message-circle'] + '<span class="message-kind">チャット</span>')};
            item.appendChild(kind);
          }
          const sender = document.createElement('div');
          sender.className = 'message-sender';
          sender.textContent = notif.title;
          const body = document.createElement('div');
          body.className = 'message-text';
          body.textContent = notif.body;
          item.appendChild(sender);
          if (notif.kind === 'process' && notif.process) {
            const data = notif.process;
            const element = (className, text) => {
              const el = document.createElement('div');
              el.className = className;
              el.textContent = text;
              return el;
            };
            const heading = document.createElement('div');
            heading.className = 'process-heading';
            heading.innerHTML = ${JSON.stringify(notificationIcons.columns + '<span>工程管理</span>')};
            item.insertBefore(heading, sender);
            if (data.projectName) item.insertBefore(element('process-project', data.projectName), sender);
            if (data.nextStatus) {
              const transition = document.createElement('div');
              transition.className = 'process-transition';
              if (data.event !== 'created') {
                transition.appendChild(element('process-status', data.previousStatus));
                const arrow = document.createElement('span');
                arrow.innerHTML = ${JSON.stringify(notificationIcons['arrow-right'])};
                transition.appendChild(arrow);
              } else {
                transition.appendChild(element('process-status', '新タスク'));
              }
              transition.appendChild(element('process-status next', data.nextStatus));
              item.appendChild(transition);
            }
            if (data.actorName) {
              const date = new Date(data.occurredAt);
              const time = Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
              item.appendChild(element('process-actor', (data.event === 'created' ? '作成者：' : '変更者：') + data.actorName + '  ' + time));
            }
            const open = element('process-open', 'クリックしてタスクを確認');
            const chevron = document.createElement('span');
            chevron.innerHTML = ${JSON.stringify(notificationIcons['chevron-right'])};
            open.appendChild(chevron);
            item.appendChild(open);
          } else item.appendChild(body);
          item.onclick = () => {
            if (notif.kind === 'process' && notif.process && window.notificationAPI) {
              window.notificationAPI.openProcessTask(notif.process.projectId, notif.process.taskId);
            } else if (notif.scheduleId && window.notificationAPI) {
              window.notificationAPI.openSchedule(notif.scheduleId);
            } else if (notif.roomId && window.notificationAPI) {
              window.notificationAPI.openRoom(notif.roomId);
            } else if (window.notificationAPI) {
              window.notificationAPI.openMainWindow();
            }
            window.notificationAPI?.clearAll();
          };
          item.onkeydown = (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); item.click(); }
          };
          messageList.appendChild(item);
        });

        // OKボタンで全ての通知をクリア
        document.getElementById('okBtn').onclick = () => {
          if (window.notificationAPI) {
            window.notificationAPI.clearAll();
          }
        };
        document.getElementById('closeBtn').onclick = () => window.notificationAPI?.clearAll();

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
