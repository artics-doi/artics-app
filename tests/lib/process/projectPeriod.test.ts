// projectPeriod（タスク配列→期間算出）の境界ケーステスト。
// vitest は named import（理由は order.test.ts のコメント参照）。
import { describe, test, expect } from 'vitest';
import { calcProjectPeriod } from '../../../src/lib/process/projectPeriod';
import type { Task } from '../../../src/types/process';

// テスト用の最小タスクを作るヘルパー。
function makeTask(partial: Partial<Task>): Task {
  return {
    id: 'id',
    title: '',
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

describe('calcProjectPeriod', () => {
  test('空配列なら start/end ともに null', () => {
    expect(calcProjectPeriod([])).toEqual({ start: null, end: null });
  });

  test('全タスクが日付未設定なら start/end ともに null', () => {
    const tasks = [makeTask({}), makeTask({})];
    expect(calcProjectPeriod(tasks)).toEqual({ start: null, end: null });
  });

  test('最早の startDate と最遅の endDate を返す', () => {
    const tasks = [
      makeTask({ startDate: new Date('2026-01-10'), endDate: new Date('2026-01-20') }),
      makeTask({ startDate: new Date('2026-01-05'), endDate: new Date('2026-01-15') }),
      makeTask({ startDate: new Date('2026-01-08'), endDate: new Date('2026-01-25') }),
    ];
    const period = calcProjectPeriod(tasks);
    expect(period.start?.toISOString()).toBe(new Date('2026-01-05').toISOString());
    expect(period.end?.toISOString()).toBe(new Date('2026-01-25').toISOString());
  });

  test('startDate だけ / endDate だけのタスクが混在しても端を拾う', () => {
    const tasks = [
      makeTask({ startDate: new Date('2026-02-01'), endDate: null }),
      makeTask({ startDate: null, endDate: new Date('2026-02-28') }),
    ];
    const period = calcProjectPeriod(tasks);
    expect(period.start?.toISOString()).toBe(new Date('2026-02-01').toISOString());
    expect(period.end?.toISOString()).toBe(new Date('2026-02-28').toISOString());
  });
});
