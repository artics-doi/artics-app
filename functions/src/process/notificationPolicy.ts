// 通知対象の判定は担当者に依存しない。並べ替え・日付編集・アーカイブでは通知しない。
export type ProcessEvent = 'created' | 'todo' | 'doing' | 'done' | 'hold';
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
  if (before && before.columnId === after.columnId) return null;
  const columns = (Array.isArray(project.columns) ? project.columns : []).filter(
    (value): value is Column => !!value && typeof value.id === 'string' && typeof value.name === 'string',
  );
  const next = columns.find(column => column.id === after.columnId);
  if (!next) return null;
  const kind = columnKind(next);
  if (before && !['todo', 'doing', 'done', 'hold'].includes(kind)) return null;
  return {
    event: (before ? kind : 'created') as ProcessEvent,
    previousStatus: before ? columns.find(column => column.id === before.columnId)?.name ?? '変更前' : '',
    nextStatus: next.name,
  };
}

export function processRecipientIds(members: Data[], event: ProcessEvent): string[] {
  return [...new Set(members.filter(member => {
    const settings = member.notification as Data | undefined;
    return typeof member.linkedUserId === 'string' && member.linkedUserId.length > 0 && !member.linkedUserId.includes('/')
      && settings?.enabled === true && Array.isArray(settings.events) && settings.events.includes(event);
  }).map(member => member.linkedUserId as string))];
}

export function processNotificationUrl(projectId: string, taskId: string): string {
  return `/#/process/projects/${encodeURIComponent(projectId)}/board?task=${encodeURIComponent(taskId)}&from=notification`;
}
