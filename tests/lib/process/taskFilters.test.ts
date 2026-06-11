import { describe, expect, test } from 'vitest';
import {
  EMPTY_TASK_FILTERS,
  filterTasks,
  getTaskMissingCheck,
  hasTaskMissingFields,
  taskMatchesFilters,
} from '../../../src/lib/process/taskFilters';
import type { Task } from '../../../src/types/process';

function makeTask(partial: Partial<Task>): Task {
  return {
    id: 'id',
    title: 'タスク',
    projectId: 'p',
    columnId: 'todo',
    assigneeIds: [],
    startDate: null,
    endDate: null,
    description: '',
    order: 'a0',
    ganttOrder: 'a0',
    archived: false,
    createdBy: 'u',
    createdByName: 'U',
    createdAt: null,
    updatedAt: null,
    ...partial,
  };
}

describe('getTaskMissingCheck', () => {
  test('担当者・開始日・終了日の未設定を判定する', () => {
    expect(getTaskMissingCheck(makeTask({}))).toEqual({
      assignee: true,
      startDate: true,
      endDate: true,
    });

    expect(
      getTaskMissingCheck(
        makeTask({
          assigneeIds: ['m1'],
          startDate: new Date('2026-06-01'),
          endDate: new Date('2026-06-02'),
        }),
      ),
    ).toEqual({
      assignee: false,
      startDate: false,
      endDate: false,
    });
  });

  test('未設定が1つでもあれば true', () => {
    expect(hasTaskMissingFields(makeTask({ assigneeIds: ['m1'] }))).toBe(true);
    expect(
      hasTaskMissingFields(
        makeTask({
          assigneeIds: ['m1'],
          startDate: new Date('2026-06-01'),
          endDate: new Date('2026-06-02'),
        }),
      ),
    ).toBe(false);
  });
});

describe('taskMatchesFilters', () => {
  const completeTask = makeTask({
    id: 'complete',
    title: '設計レビュー',
    description: 'ICV4400\n担当確認',
    columnId: 'doing',
    assigneeIds: ['m1'],
    startDate: new Date('2026-06-01'),
    endDate: new Date('2026-06-02'),
  });

  test('タイトルと説明を検索する', () => {
    expect(taskMatchesFilters(completeTask, { ...EMPTY_TASK_FILTERS, query: 'レビュー' })).toBe(true);
    expect(taskMatchesFilters(completeTask, { ...EMPTY_TASK_FILTERS, query: '担当確認' })).toBe(true);
    expect(taskMatchesFilters(completeTask, { ...EMPTY_TASK_FILTERS, query: 'not-found' })).toBe(false);
  });

  test('担当者・未担当・ステータスで絞り込む', () => {
    expect(taskMatchesFilters(completeTask, { ...EMPTY_TASK_FILTERS, assigneeId: 'm1' })).toBe(true);
    expect(taskMatchesFilters(completeTask, { ...EMPTY_TASK_FILTERS, assigneeId: 'm2' })).toBe(false);
    expect(taskMatchesFilters(completeTask, { ...EMPTY_TASK_FILTERS, assigneeId: 'unassigned' })).toBe(false);
    expect(taskMatchesFilters(makeTask({}), { ...EMPTY_TASK_FILTERS, assigneeId: 'unassigned' })).toBe(true);
    expect(taskMatchesFilters(completeTask, { ...EMPTY_TASK_FILTERS, columnId: 'doing' })).toBe(true);
    expect(taskMatchesFilters(completeTask, { ...EMPTY_TASK_FILTERS, columnId: 'done' })).toBe(false);
  });

  test('日付あり・日付未設定・未設定のみで絞り込む', () => {
    expect(taskMatchesFilters(completeTask, { ...EMPTY_TASK_FILTERS, dateFilter: 'complete' })).toBe(true);
    expect(taskMatchesFilters(completeTask, { ...EMPTY_TASK_FILTERS, dateFilter: 'missing' })).toBe(false);
    expect(taskMatchesFilters(completeTask, { ...EMPTY_TASK_FILTERS, missingOnly: true })).toBe(false);

    const missingTask = makeTask({ id: 'missing', assigneeIds: ['m1'], startDate: new Date('2026-06-01') });
    expect(taskMatchesFilters(missingTask, { ...EMPTY_TASK_FILTERS, dateFilter: 'complete' })).toBe(false);
    expect(taskMatchesFilters(missingTask, { ...EMPTY_TASK_FILTERS, dateFilter: 'missing' })).toBe(true);
    expect(taskMatchesFilters(missingTask, { ...EMPTY_TASK_FILTERS, missingOnly: true })).toBe(true);
  });
});

describe('filterTasks', () => {
  test('複数条件でタスク一覧を絞り込む', () => {
    const tasks = [
      makeTask({ id: 'a', title: '設計レビュー', assigneeIds: ['m1'], columnId: 'doing' }),
      makeTask({ id: 'b', title: '試作確認', assigneeIds: ['m2'], columnId: 'todo' }),
      makeTask({ id: 'c', title: '設計修正', assigneeIds: ['m1'], columnId: 'done' }),
    ];

    expect(
      filterTasks(tasks, {
        ...EMPTY_TASK_FILTERS,
        query: '設計',
        assigneeId: 'm1',
        columnId: 'doing',
      }).map((task) => task.id),
    ).toEqual(['a']);
  });
});
