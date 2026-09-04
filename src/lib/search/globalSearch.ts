import type { ChatRoom } from '../../types';
import type { ScheduleEvent } from '../../types/schedule';
import type { Task } from '../../types/process';

export type GlobalSearchKind = 'chat' | 'memo' | 'schedule' | 'task';

export interface GlobalSearchResult {
  kind: GlobalSearchKind;
  id: string;
  title: string;
  subtitle: string;
  text: string;
  timestamp: Date;
  path: string;
}

export interface SearchableMessage {
  id: string;
  roomId: string;
  roomName: string;
  roomType: ChatRoom['type'];
  text: string;
  senderName: string;
  timestamp: Date;
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function includesQuery(values: readonly string[], query: string): boolean {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return false;
  return values.some((value) => normalize(value).includes(normalizedQuery));
}

export function searchMessages(messages: readonly SearchableMessage[], query: string): GlobalSearchResult[] {
  return messages
    .filter((message) => includesQuery([message.text, message.senderName, message.roomName], query))
    .map((message) => ({
      kind: message.roomType === 'memo' ? 'memo' : 'chat',
      id: message.id,
      title: message.roomName,
      subtitle: message.senderName,
      text: message.text,
      timestamp: message.timestamp,
      path: message.roomType === 'memo'
        ? `/memo/${message.roomId}?messageId=${message.id}`
        : `/chat/${message.roomId}?messageId=${message.id}`,
    }));
}

export function searchSchedules(schedules: readonly ScheduleEvent[], query: string): GlobalSearchResult[] {
  return schedules
    .filter((schedule) => includesQuery([schedule.title, schedule.memo, schedule.targetUserNames.join(' ')], query))
    .map((schedule) => ({
      kind: 'schedule',
      id: schedule.id,
      title: schedule.title || '(無題の予定)',
      subtitle: schedule.targetUserNames.join('、') || '対象ユーザーなし',
      text: schedule.memo,
      timestamp: schedule.startAt,
      path: `/schedule?scheduleId=${schedule.id}`,
    }));
}

export function searchTasks(
  tasks: readonly Task[],
  query: string,
  projectNameById: ReadonlyMap<string, string>,
): GlobalSearchResult[] {
  return tasks
    .filter((task) => !task.isArchived && includesQuery([
      task.title,
      task.description,
      projectNameById.get(task.projectId) ?? '',
    ], query))
    .map((task) => ({
      kind: 'task',
      id: task.id,
      title: task.title || '(無題のタスク)',
      subtitle: projectNameById.get(task.projectId) ?? '工程管理',
      text: task.description,
      timestamp: task.updatedAt ?? task.createdAt ?? new Date(0),
      path: `/process/projects/${task.projectId}/board?task=${task.id}`,
    }));
}

export function sortGlobalSearchResults(results: readonly GlobalSearchResult[], limit: number): GlobalSearchResult[] {
  return [...results]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}
