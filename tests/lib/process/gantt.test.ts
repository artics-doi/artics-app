import { describe, expect, it } from 'vitest';
import type { ProcessMember, ProjectColumn, Task } from '../../../src/types/process';
import {
  buildGanttTimelineBounds,
  buildReorderedGanttTaskIds,
  ganttDragGeometryToTaskDates,
  ganttDatesToTaskDates,
  resolveGanttUpdateTaskDates,
  sortProcessGanttTasks,
  toProcessGanttData,
} from '../../../src/lib/process/gantt';

const columns: ProjectColumn[] = [
  { id: 'todo', name: '未着手', order: 0 },
  { id: 'doing', name: '進行中', order: 1 },
  { id: 'done', name: '完了', order: 2 },
  { id: 'hold', name: '保留', order: 3 },
];

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
    description: '',
    order: 'a0',
    ganttOrder: 'a0',
    archived: false,
    createdBy: 'u1',
    createdByName: 'User',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('process gantt adapter', () => {
  it('日付ありタスクをSVAR用タスクに変換し、終了日は翌日にする', () => {
    const result = toProcessGanttData(
      [
        task({
          id: 'task-1',
          columnId: 'doing',
          assigneeIds: ['m1'],
          startDate: new Date(2026, 5, 8),
          endDate: new Date(2026, 5, 10),
        }),
      ],
      columns,
      members,
    );

    expect(result.unscheduledTasks).toHaveLength(0);
    expect(result.tasks[0]).toMatchObject({
      id: 'task-1',
      columnName: '進行中',
      assigneeText: '山田',
      processStatus: 'doing',
      css: 'articsGanttTask-doing',
      duration: 3,
      progress: 50,
    });
    expect(result.tasks[0].start).toEqual(new Date(2026, 5, 8));
    expect(result.tasks[0].end).toEqual(new Date(2026, 5, 11));
  });

  it('日付未設定タスクは別枠に分ける', () => {
    const result = toProcessGanttData([task({ id: 'unscheduled' })], columns, members);

    expect(result.tasks).toHaveLength(0);
    expect(result.unscheduledTasks[0].id).toBe('unscheduled');
  });

  it('保留列のタスクは保留ステータスとガント色クラスに変換する', () => {
    const result = toProcessGanttData(
      [
        task({
          id: 'hold-task',
          columnId: 'hold',
          startDate: new Date(2026, 5, 8),
          endDate: new Date(2026, 5, 8),
        }),
      ],
      columns,
      members,
    );

    expect(result.tasks[0]).toMatchObject({
      processStatus: 'hold',
      css: 'articsGanttTask-hold',
    });
  });

  it('ガント専用のganttOrderでタスクを並び替える', () => {
    const result = toProcessGanttData(
      [
        task({
          id: 'later',
          title: '後ろ',
          ganttOrder: 'b0',
          startDate: new Date(2026, 5, 8),
          endDate: new Date(2026, 5, 8),
        }),
        task({
          id: 'first',
          title: '先頭',
          ganttOrder: 'a0',
          startDate: new Date(2026, 5, 10),
          endDate: new Date(2026, 5, 10),
        }),
      ],
      columns,
      members,
    );

    expect(result.tasks.map((item) => item.id)).toEqual(['first', 'later']);
  });

  it('ガント手動並び替え用にタスクID順を入れ替える', () => {
    const reorderedIds = buildReorderedGanttTaskIds(
      [{ id: 'dr' }, { id: 'frame' }, { id: 'debug' }, { id: 'sales' }],
      'debug',
      'frame',
    );

    expect(reorderedIds).toEqual(['dr', 'debug', 'frame', 'sales']);
  });

  it('列IDを優先してガントステータスを判定する', () => {
    const result = toProcessGanttData(
      [
        task({
          id: 'done-task',
          columnId: 'done',
          startDate: new Date(2026, 5, 8),
          endDate: new Date(2026, 5, 8),
        }),
      ],
      [{ id: 'done', name: '検収済み', order: 2 }],
      members,
    );

    expect(result.tasks[0].processStatus).toBe('done');
  });

  it('一括並び替えで開始日が近い順に並べる', () => {
    const result = toProcessGanttData(
      [
        task({
          id: 'manual-first',
          title: '手動では先頭',
          ganttOrder: 'a0',
          startDate: new Date(2026, 5, 20),
          endDate: new Date(2026, 5, 20),
        }),
        task({
          id: 'near-start',
          title: '開始日が近い',
          ganttOrder: 'b0',
          startDate: new Date(2026, 5, 9),
          endDate: new Date(2026, 5, 12),
        }),
      ],
      columns,
      members,
    );

    expect(sortProcessGanttTasks(result.tasks, 'start-asc').map((item) => item.id)).toEqual([
      'near-start',
      'manual-first',
    ]);
  });

  it('一括並び替えで未着手を先頭に並べる', () => {
    const result = toProcessGanttData(
      [
        task({
          id: 'doing',
          columnId: 'doing',
          ganttOrder: 'a0',
          startDate: new Date(2026, 5, 8),
          endDate: new Date(2026, 5, 8),
        }),
        task({
          id: 'todo',
          columnId: 'todo',
          ganttOrder: 'b0',
          startDate: new Date(2026, 5, 8),
          endDate: new Date(2026, 5, 8),
        }),
      ],
      columns,
      members,
    );

    expect(sortProcessGanttTasks(result.tasks, 'todo-first').map((item) => item.id)).toEqual([
      'todo',
      'doing',
    ]);
  });

  it('SVARの翌日endをFirestoreの終了日に戻す', () => {
    expect(ganttDatesToTaskDates(new Date(2026, 5, 8), new Date(2026, 5, 11))).toEqual({
      startDate: new Date(2026, 5, 8),
      endDate: new Date(2026, 5, 10),
    });
  });

  it('SVARの移動diffを開始日と終了日の両方へ反映する', () => {
    const source = task({
      startDate: new Date(2026, 5, 8),
      endDate: new Date(2026, 5, 12),
    });

    expect(
      resolveGanttUpdateTaskDates(source, {
        start: new Date(2026, 5, 8),
        end: new Date(2026, 5, 13),
        diff: 2,
      }),
    ).toEqual({
      startDate: new Date(2026, 5, 10),
      endDate: new Date(2026, 5, 14),
    });
  });

  it('SVARの左端リサイズdiffを開始日にだけ反映する', () => {
    const source = task({
      startDate: new Date(2026, 5, 8),
      endDate: new Date(2026, 5, 12),
    });

    expect(
      resolveGanttUpdateTaskDates(source, {
        start: new Date(2026, 5, 8),
        diff: 1,
      }),
    ).toEqual({
      startDate: new Date(2026, 5, 9),
      endDate: new Date(2026, 5, 12),
    });
  });

  it('SVARの右端リサイズdiffを終了日にだけ反映する', () => {
    const source = task({
      startDate: new Date(2026, 5, 8),
      endDate: new Date(2026, 5, 12),
    });

    expect(
      resolveGanttUpdateTaskDates(source, {
        end: new Date(2026, 5, 13),
        diff: 2,
      }),
    ).toEqual({
      startDate: new Date(2026, 5, 8),
      endDate: new Date(2026, 5, 14),
    });
  });

  it('ドラッグ中のday表示geometryを開始日と終了日に変換する', () => {
    expect(
      ganttDragGeometryToTaskDates(
        { left: 44 * 3, width: 44 * 5 },
        new Date(2026, 5, 1),
        44,
        'day',
      ),
    ).toEqual({
      startDate: new Date(2026, 5, 4),
      endDate: new Date(2026, 5, 8),
    });
  });

  it('ドラッグ中のweek表示geometryを週単位の日付範囲に変換する', () => {
    expect(
      ganttDragGeometryToTaskDates(
        { left: 72 * 2, width: 72 * 2 },
        new Date(2026, 5, 1),
        72,
        'week',
      ),
    ).toEqual({
      startDate: new Date(2026, 5, 15),
      endDate: new Date(2026, 5, 28),
    });
  });

  it('タイムライン範囲は今日とタスク範囲を含める', () => {
    const bounds = buildGanttTimelineBounds(
      [
        {
          id: 'task-1',
          sourceTaskId: 'task-1',
          text: 'task',
          start: new Date(2026, 5, 20),
          end: new Date(2026, 5, 22),
          type: 'task',
          columnName: '未着手',
          assigneeText: '未設定',
          processStatus: 'todo',
          ganttOrder: 'a0',
          css: 'articsGanttTask-todo',
        },
      ],
      new Date(2026, 5, 8),
    );

    expect(bounds.start).toEqual(new Date(2026, 5, 5));
    expect(bounds.end).toEqual(new Date(2026, 5, 29));
  });
});
