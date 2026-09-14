export interface ProcessNotificationDetails {
  projectId: string;
  taskId: string;
  projectName: string;
  event: 'created' | 'todo' | 'doing' | 'done' | 'hold';
  previousStatus: string;
  nextStatus: string;
  actorName: string;
  occurredAt: string;
}

export interface NotificationOptions {
  title: string;
  body: string;
  roomId?: string;
  scheduleId?: string;
  kind?: 'chat' | 'schedule' | 'process';
  process?: ProcessNotificationDetails;
}

export interface NotificationDisplayItem extends NotificationOptions { id: number }

export function parseProcessNotification(value: unknown): ProcessNotificationDetails | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Record<string, unknown>;
  if (typeof data.projectId !== 'string' || !data.projectId || data.projectId.includes('/')
    || typeof data.taskId !== 'string' || !data.taskId || data.taskId.includes('/')) return;
  if (!['created', 'todo', 'doing', 'done', 'hold'].includes(String(data.event))) return;
  const text = (key: string) => typeof data[key] === 'string' ? data[key].slice(0, 500) : '';
  return {
    projectId: data.projectId, taskId: data.taskId,
    projectName: text('projectName'), event: data.event as ProcessNotificationDetails['event'],
    previousStatus: text('previousStatus'), nextStatus: text('nextStatus'),
    actorName: text('actorName'), occurredAt: text('occurredAt'),
  };
}
