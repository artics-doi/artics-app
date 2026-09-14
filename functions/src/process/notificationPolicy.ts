// 担当者には選択したアクション、進捗管理者には全アクションを通知する。
export type ProcessEvent = 'created' | 'todo' | 'doing' | 'done' | 'hold' | 'approved';
type Data = Record<string, unknown>;
type Column = { id: string; name: string; kind?: string };

function columnKind(column: Column): string {
  if (column.kind) return column.kind;
  if (column.id === 'todo' || /未着手|未対応/.test(column.name)) return 'todo';
  if (column.id === 'doing' || /進行|対応中/.test(column.name)) return 'doing';
  if (column.id === 'done' || /完了/.test(column.name)) return 'done';
  if (column.id === 'hold' || /保留/.test(column.name)) return 'hold';
  return 'custom';
}

export function resolveProcessEvent(before: Data | undefined, after: Data | undefined, project: Data) {
  if (!after || project.status === 'archived' || project.pendingDelete === true || project.lifecycleState === 'deleting') return null;
  if (after.archived === true || after.isArchived === true || before?.archived === true || before?.isArchived === true) return null;
  const columns = (Array.isArray(project.columns) ? project.columns : []).filter(
    (value): value is Column => !!value && typeof value.id === 'string' && typeof value.name === 'string',
  );
  const next = columns.find(column => column.id === after.columnId);
  if (!next) return null;
  const kind = columnKind(next);
  if (before && before.columnId === after.columnId) {
    // 完了列の未チェック→チェックだけを承認とする。解除や承認済みの編集は通知しない。
    if (kind !== 'done' || before.completionChecked === true || after.completionChecked !== true) return null;
    return { event: 'approved' as const, previousStatus: '承認前', nextStatus: '完了承認' };
  }
  if (before && !['todo', 'doing', 'done', 'hold'].includes(kind)) return null;
  return {
    event: (before ? kind : 'created') as ProcessEvent,
    previousStatus: before ? columns.find(column => column.id === before.columnId)?.name ?? '変更前' : '',
    nextStatus: next.name,
  };
}

export const PROCESS_EVENTS: ProcessEvent[] = ['created', 'todo', 'doing', 'done', 'approved', 'hold'];

export function processRecipientIds(members: Data[], event: ProcessEvent, assigneeIds: unknown): string[] {
  if (!PROCESS_EVENTS.includes(event)) return [];
  const assigned = new Set(Array.isArray(assigneeIds) ? assigneeIds.filter(id => typeof id === 'string') : []);
  return [...new Set(members.filter(member => {
    const settings = member.notification as Data | undefined;
    if (typeof member.linkedUserId !== 'string' || !member.linkedUserId || member.linkedUserId.includes('/')) return false;
    if (member.isTaskProgressManager === true) return true;
    // assigneeIdsはAuth UIDではなくprocessMembersの文書ID。旧enabledは参照しない。
    const events = Array.isArray(settings?.events) ? settings.events : PROCESS_EVENTS;
    return typeof member.id === 'string' && assigned.has(member.id) && events.includes(event);
  }).map(member => member.linkedUserId as string))];
}

export function processNotificationUrl(projectId: string, taskId: string): string {
  return `/#/process/projects/${encodeURIComponent(projectId)}/board?task=${encodeURIComponent(taskId)}&from=notification`;
}
