import type { ProcessNotificationEvent, ProcessNotificationSettings } from '../../types/process';

export const PROCESS_NOTIFICATION_EVENTS: { value: ProcessNotificationEvent; label: string }[] = [
  { value: 'created', label: '新タスク作成' },
  { value: 'todo', label: '未着手へ変更' },
  { value: 'doing', label: '進行中へ変更' },
  { value: 'done', label: '完了へ変更' },
  { value: 'hold', label: '保留へ変更' },
];

export function normalizeProcessNotification(value: unknown): ProcessNotificationSettings {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const events = Array.isArray(data.events)
    ? PROCESS_NOTIFICATION_EVENTS.map(item => item.value).filter(event => data.events instanceof Array && data.events.includes(event))
    : PROCESS_NOTIFICATION_EVENTS.map(item => item.value);
  return { enabled: data.enabled === true, events };
}

export function processTaskPath(projectId: string, taskId: string): string {
  return `/process/projects/${encodeURIComponent(projectId)}/board?task=${encodeURIComponent(taskId)}&from=notification`;
}
