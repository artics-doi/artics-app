import type { ProcessNotificationEvent, ProcessNotificationSettings } from '../../types/process';

export const PROCESS_NOTIFICATION_EVENTS: { value: ProcessNotificationEvent; label: string }[] = [
  { value: 'created', label: '新タスク作成' },
  { value: 'todo', label: '未着手へ変更' },
  { value: 'doing', label: '進行中へ変更' },
  { value: 'done', label: '完了へ変更' },
  { value: 'approved', label: '完了承認（チェックを入れたとき）' },
  { value: 'hold', label: '保留へ変更' },
];

export function normalizeProcessNotification(value: unknown): ProcessNotificationSettings {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const events = Array.isArray(data.events)
    ? PROCESS_NOTIFICATION_EVENTS.map(item => item.value).filter(event => data.events instanceof Array && data.events.includes(event))
    : PROCESS_NOTIFICATION_EVENTS.map(item => item.value);
  // 旧enabledは廃止。選択済みアクションは維持し、設定なしは全種類を初期選択する。
  return { events };
}

export function processTaskPath(projectId: string, taskId: string): string {
  return `/process/projects/${encodeURIComponent(projectId)}/board?task=${encodeURIComponent(taskId)}&from=notification`;
}
