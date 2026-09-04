import { describe, expect, test } from 'vitest';
import {
  searchMessages,
  searchSchedules,
  searchTasks,
  sortGlobalSearchResults,
  type SearchableMessage,
} from '../../../src/lib/search/globalSearch';
import type { ScheduleEvent } from '../../../src/types/schedule';
import type { Task } from '../../../src/types/process';

function d(year: number, month: number, day: number, hour = 0): Date {
  return new Date(year, month - 1, day, hour);
}

function schedule(partial: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    id: 's1',
    title: '中会議室予約',
    categoryId: 'smallMeetingRoom',
    targetUserIds: [],
    targetUserNames: ['土居'],
    startAt: d(2026, 6, 11, 10),
    endAt: d(2026, 6, 11, 11),
    allDay: false,
    memo: '商談準備',
    notification: { enabled: false, timings: [], customAt: null },
    createdBy: 'u1',
    createdByName: '土居',
    createdAt: d(2026, 6, 1),
    updatedAt: null,
    ...partial,
  };
}

function task(partial: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: '見積作成',
    projectId: 'p1',
    columnId: 'todo',
    assigneeIds: [],
    startDate: null,
    endDate: null,
    completedDate: null,
    completionChecked: false,
    description: '商談後に対応',
    order: 'a0',
    ganttOrder: 'a0',
    archived: false,
    isArchived: false,
    createdBy: 'u1',
    createdByName: '土居',
    createdAt: d(2026, 6, 9),
    updatedAt: d(2026, 6, 10),
    ...partial,
  };
}

describe('global search', () => {
  test('チャットとメモを種別ごとの遷移先つきで検索する', () => {
    const messages: SearchableMessage[] = [
      { id: 'm1', roomId: 'r1', roomName: '営業', roomType: 'group', text: '商談メモ', senderName: '土居', timestamp: d(2026, 6, 11) },
      { id: 'm2', roomId: 'memo1', roomName: '個人メモ', roomType: 'memo', text: '商談の要点', senderName: '土居', timestamp: d(2026, 6, 10) },
    ];

    const results = searchMessages(messages, '商談');
    expect(results.map((result) => result.kind)).toEqual(['chat', 'memo']);
    expect(results[0].path).toBe('/chat/r1?messageId=m1');
    expect(results[1].path).toBe('/memo/memo1?messageId=m2');
  });

  test('予定とタスクを検索して新しい順に並べる', () => {
    const projectNameById = new Map([['p1', '営業管理']]);
    const results = sortGlobalSearchResults([
      ...searchSchedules([schedule()], '商談'),
      ...searchTasks([task()], '商談', projectNameById),
    ], 10);

    expect(results.map((result) => result.kind)).toEqual(['schedule', 'task']);
    expect(results[0].path).toBe('/schedule?scheduleId=s1');
    expect(results[1].path).toBe('/process/projects/p1/board?task=t1');
  });

  test('個別アーカイブ済みタスクは検索結果に含めない', () => {
    const projectNameById = new Map([['p1', '営業管理']]);
    expect(searchTasks([task({ isArchived: true })], '商談', projectNameById)).toEqual([]);
  });
});
