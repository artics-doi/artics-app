import { describe, expect, it } from 'vitest';
import type { ProcessMember, Project, Task } from '../../../src/types/process';
import {
  buildProjectOverviewTasks,
  buildTimelineWindow,
  normalizeTimelineStart,
  shiftTimelineStart,
  todayPositionPercent,
} from '../../../src/lib/process/ganttOverview';

const project: Project = {
  id: 'project-1',
  name: 'ICV-100',
  description: '',
  colorIndex: 0,
  status: 'active',
  columns: [
    { id: 'todo', name: '未着手', order: 0 },
    { id: 'doing', name: '進行中', order: 1 },
    { id: 'done', name: '完了', order: 2 },
    { id: 'hold', name: '保留', order: 3 },
  ],
  order: 'a0',
  createdBy: 'u1',
  createdByName: 'User',
  createdAt: null,
  updatedAt: null,
};

const members: ProcessMember[] = [
  { id: 'm1', name: '山田', colorIndex: 0, linkedUserId: null, order: 0 },
];

function task(overrides: Partial<Task>): Task {
  return {
    id: 'task-1',
    title: 'タスク1',
    projectId: 'project-1',
    columnId: 'todo',
    assigneeIds: [],
    startDate: null,
    endDate: null,
    completedDate: null,
    completionChecked: false,
    description: '',
    order: 'a0',
    ganttOrder: 'a0',
    archived: false,
    isArchived: false,
    createdBy: 'u1',
    createdByName: 'User',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('process gantt overview', () => {
  it('粒度ごとのタイムライン範囲を生成する', () => {
    const week = buildTimelineWindow(new Date(2026, 5, 12), 'week');
    const month = buildTimelineWindow(new Date(2026, 5, 12), 'month');
    const quarter = buildTimelineWindow(new Date(2026, 5, 12), 'quarter');

    expect(week.ticks).toHaveLength(12);
    expect(week.rangeStart).toEqual(new Date(2026, 5, 8));
    expect(week.rangeEnd).toEqual(new Date(2026, 7, 30));
    expect(month.ticks.map((tick) => tick.label)).toEqual([
      '2026/6',
      '2026/7',
      '2026/8',
      '2026/9',
      '2026/10',
      '2026/11',
    ]);
    expect(quarter.ticks.map((tick) => tick.label)).toEqual([
      '2026 Q2',
      '2026 Q3',
      '2026 Q4',
      '2027 Q1',
    ]);
  });

  it('表示期間の移動は選択中の粒度に合わせる', () => {
    expect(shiftTimelineStart(new Date(2026, 5, 1), 'month', 1)).toEqual(new Date(2026, 11, 1));
    expect(shiftTimelineStart(new Date(2026, 3, 1), 'quarter', 1)).toEqual(new Date(2027, 3, 1));
    expect(shiftTimelineStart(new Date(2026, 5, 8), 'week', -1)).toEqual(new Date(2026, 2, 16));
  });

  it('粒度変更時の基準日を粒度の先頭に丸める', () => {
    expect(normalizeTimelineStart(new Date(2026, 5, 12), 'week')).toEqual(new Date(2026, 5, 8));
    expect(normalizeTimelineStart(new Date(2026, 5, 12), 'month')).toEqual(new Date(2026, 5, 1));
    expect(normalizeTimelineStart(new Date(2026, 5, 12), 'quarter')).toEqual(new Date(2026, 3, 1));
  });

  it('表示対象・期間外・日付未設定タスクに分類する', () => {
    const window = buildTimelineWindow(new Date(2026, 5, 1), 'month');
    const result = buildProjectOverviewTasks(
      project,
      [
        task({
          id: 'visible',
          title: '表示対象',
          columnId: 'doing',
          assigneeIds: ['m1'],
          startDate: new Date(2026, 5, 10),
          endDate: new Date(2026, 5, 12),
        }),
        task({
          id: 'outside',
          title: '期間外',
          startDate: new Date(2027, 0, 5),
          endDate: new Date(2027, 0, 6),
        }),
        task({
          id: 'unscheduled',
          title: '未設定',
        }),
        task({
          id: 'archived',
          title: 'アーカイブ',
          startDate: new Date(2026, 5, 10),
          endDate: new Date(2026, 5, 10),
          archived: true,
          isArchived: false,
        }),
      ],
      members,
      window,
    );

    expect(result.visibleTasks.map((item) => item.task.id)).toEqual(['visible']);
    expect(result.visibleTasks[0]).toMatchObject({
      columnName: '進行中',
      assigneeText: '山田',
      status: 'doing',
    });
    expect(result.outOfRangeTasks.map((item) => item.task.id)).toEqual(['outside']);
    expect(result.unscheduledTasks.map((item) => item.task.id)).toEqual(['unscheduled']);
  });

  it('バー位置は表示範囲端でクランプする', () => {
    const window = buildTimelineWindow(new Date(2026, 5, 1), 'month');
    const result = buildProjectOverviewTasks(
      project,
      [
        task({
          id: 'clamped',
          startDate: new Date(2026, 4, 20),
          endDate: new Date(2026, 5, 10),
        }),
      ],
      members,
      window,
    );

    expect(result.visibleTasks[0].left).toBe(0);
    expect(result.visibleTasks[0].width).toBeGreaterThan(4);
  });

  it('早期完了タスクは横断ガント用の通常色割合を持つ', () => {
    const window = buildTimelineWindow(new Date(2026, 5, 1), 'month');
    const result = buildProjectOverviewTasks(
      project,
      [
        task({
          id: 'early',
          columnId: 'done',
          startDate: new Date(2026, 5, 15),
          endDate: new Date(2026, 5, 24),
          completedDate: new Date(2026, 5, 20),
        }),
      ],
      members,
      window,
    );

    expect(result.visibleTasks[0].earlyCompletionSolidPercent).toBeCloseTo(60);
  });

  it('個別アーカイブ済みタスクは横断ガントに含めない', () => {
    const window = buildTimelineWindow(new Date(2026, 5, 1), 'month');
    const result = buildProjectOverviewTasks(
      project,
      [task({ id: 'archived', isArchived: true })],
      members,
      window,
    );

    expect(result.visibleTasks).toEqual([]);
    expect(result.outOfRangeTasks).toEqual([]);
    expect(result.unscheduledTasks).toEqual([]);
  });

  it('今日線は表示期間内だけ位置を返す', () => {
    const window = buildTimelineWindow(new Date(2026, 5, 1), 'month');

    expect(todayPositionPercent(window, new Date(2026, 5, 1))).toBe(0);
    expect(todayPositionPercent(window, new Date(2026, 8, 1))).toBeGreaterThan(40);
    expect(todayPositionPercent(window, new Date(2027, 0, 1))).toBeNull();
  });
});
