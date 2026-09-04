// dashboard.ts の境界ケーステスト。vitest は named import。
import { describe, test, expect } from 'vitest';
import {
  addDays,
  buildDashboardPeriodBuckets,
  buildDashboardLanes,
  buildMonthBuckets,
  buildWeekWindow,
  buildYearBuckets,
  DASHBOARD_WEEK_DAYS,
  dashboardPeriodLabel,
  filterTasksInBuckets,
  filterTasksInWindow,
  isSameDay,
  overlapsWindow,
  splitWithOverflow,
  startOfDay,
  taskBarBucketColumns,
  taskBarColumns,
  taskEffectiveRange,
} from '../../../src/lib/process/dashboard';
import type { ProcessMember, Task } from '../../../src/types/process';

function makeTask(partial: Partial<Task>): Task {
  return {
    id: 'id',
    title: '',
    projectId: 'p',
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
    createdBy: 'u',
    createdByName: 'U',
    createdAt: null,
    updatedAt: null,
    ...partial,
  };
}

function makeMember(partial: Partial<ProcessMember>): ProcessMember {
  return {
    id: 'm',
    name: 'メンバー',
    colorIndex: 0,
    order: 0,
    linkedUserId: null,
    ...partial,
  };
}

describe('startOfDay', () => {
  test('時分秒を0にする（元の Date は壊さない）', () => {
    const d = new Date('2026-06-08T15:30:45');
    const s = startOfDay(d);
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getSeconds()).toBe(0);
    // 元の Date は変更されない
    expect(d.getHours()).toBe(15);
  });
});

describe('splitWithOverflow', () => {
  test('件数が上限以下なら全件 visible・overflow 0', () => {
    expect(splitWithOverflow([1, 2, 3], 5)).toEqual({ visible: [1, 2, 3], overflow: 0 });
  });

  test('ちょうど上限なら全件 visible', () => {
    expect(splitWithOverflow([1, 2, 3], 3)).toEqual({ visible: [1, 2, 3], overflow: 0 });
  });

  test('上限超過なら先頭 limit 件 + overflow に残数', () => {
    expect(splitWithOverflow([1, 2, 3, 4, 5, 6, 7], 5)).toEqual({
      visible: [1, 2, 3, 4, 5],
      overflow: 2,
    });
  });

  test('空配列なら visible 空・overflow 0', () => {
    expect(splitWithOverflow([], 5)).toEqual({ visible: [], overflow: 0 });
  });

  test('limit 0 以下なら全件 overflow', () => {
    expect(splitWithOverflow([1, 2, 3], 0)).toEqual({ visible: [], overflow: 3 });
  });
});

describe('addDays / isSameDay', () => {
  test('addDays は日数を足した0時を返す（元 Date 不変）', () => {
    const base = new Date('2026-06-08T15:00:00');
    const next = addDays(base, 3);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(5); // 6月
    expect(next.getDate()).toBe(11);
    expect(next.getHours()).toBe(0);
    expect(base.getHours()).toBe(15); // 元は壊さない
  });

  test('addDays に負数で過去日', () => {
    expect(addDays(new Date('2026-06-08'), -1).getDate()).toBe(7);
  });

  test('isSameDay は時刻を無視して同日判定', () => {
    expect(isSameDay(new Date('2026-06-08T01:00'), new Date('2026-06-08T23:00'))).toBe(true);
    expect(isSameDay(new Date('2026-06-08'), new Date('2026-06-09'))).toBe(false);
  });
});

describe('buildWeekWindow', () => {
  test('今日起点で7日分を返す', () => {
    const today = new Date('2026-06-08T10:00:00');
    const days = buildWeekWindow(today);
    expect(days).toHaveLength(DASHBOARD_WEEK_DAYS);
    expect(days[0].getDate()).toBe(8); // 先頭は今日
    expect(days[6].getDate()).toBe(14); // 7日目
    expect(days[0].getHours()).toBe(0); // 全部0時
  });

  test('offsetWeeks=1 で翌週ウィンドウ', () => {
    const today = new Date('2026-06-08');
    const days = buildWeekWindow(today, 1);
    expect(days[0].getDate()).toBe(15);
    expect(days[6].getDate()).toBe(21);
  });

  test('offsetWeeks=-1 で前週ウィンドウ', () => {
    const today = new Date('2026-06-08');
    const days = buildWeekWindow(today, -1);
    expect(days[0].getDate()).toBe(1);
    expect(days[6].getDate()).toBe(7);
  });
});

describe('buildDashboardPeriodBuckets', () => {
  test('週表示は日単位の7バケットを返す', () => {
    const buckets = buildDashboardPeriodBuckets(new Date('2026-06-08T10:00:00'), 'week');
    expect(buckets).toHaveLength(7);
    expect(buckets[0]).toMatchObject({
      label: '月',
      subLabel: '6/8',
    });
    expect(buckets[6]).toMatchObject({
      label: '日',
      subLabel: '6/14',
    });
  });

  test('月表示は月内を週バケットに分ける', () => {
    const buckets = buildMonthBuckets(new Date('2026-06-08T10:00:00'));
    expect(buckets.map((b) => b.subLabel)).toEqual([
      '6/1-6/7',
      '6/8-6/14',
      '6/15-6/21',
      '6/22-6/28',
      '6/29-6/30',
    ]);
  });

  test('月表示の offset=1 は翌月', () => {
    const buckets = buildMonthBuckets(new Date('2026-06-08'), 1);
    expect(buckets[0].start.getMonth()).toBe(6); // 7月
    expect(buckets[0].subLabel).toBe('7/1-7/7');
  });

  test('年表示は1月から12月の12バケットを返す', () => {
    const buckets = buildYearBuckets(new Date('2026-06-08'));
    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toMatchObject({ label: '1月', subLabel: '2026' });
    expect(buckets[11]).toMatchObject({ label: '12月', subLabel: '2026' });
  });

  test('期間ラベルを表示粒度ごとに返す', () => {
    const today = new Date('2026-06-08');
    expect(dashboardPeriodLabel(today, 'week')).toBe('6/8 - 6/14');
    expect(dashboardPeriodLabel(today, 'month')).toBe('2026年6月');
    expect(dashboardPeriodLabel(today, 'year')).toBe('2026年');
  });
});

describe('taskEffectiveRange', () => {
  test('start/end 両方ありはそのまま', () => {
    const r = taskEffectiveRange(
      makeTask({ startDate: new Date('2026-06-08'), endDate: new Date('2026-06-10') }),
    );
    expect(r?.start.getDate()).toBe(8);
    expect(r?.end.getDate()).toBe(10);
  });

  test('start のみは当日1日', () => {
    const r = taskEffectiveRange(makeTask({ startDate: new Date('2026-06-08'), endDate: null }));
    expect(r?.start.getDate()).toBe(8);
    expect(r?.end.getDate()).toBe(8);
  });

  test('end のみは当日1日', () => {
    const r = taskEffectiveRange(makeTask({ startDate: null, endDate: new Date('2026-06-10') }));
    expect(r?.start.getDate()).toBe(10);
    expect(r?.end.getDate()).toBe(10);
  });

  test('両方なしは null（日付未設定）', () => {
    expect(taskEffectiveRange(makeTask({}))).toBeNull();
  });

  test('end < start の壊れデータは開始日1日に補正', () => {
    const r = taskEffectiveRange(
      makeTask({ startDate: new Date('2026-06-10'), endDate: new Date('2026-06-08') }),
    );
    expect(r?.start.getDate()).toBe(10);
    expect(r?.end.getDate()).toBe(10);
  });
});

describe('overlapsWindow', () => {
  const ws = new Date('2026-06-08');
  const we = new Date('2026-06-14');

  test('ウィンドウ内に完全に収まる', () => {
    expect(
      overlapsWindow(
        makeTask({ startDate: new Date('2026-06-09'), endDate: new Date('2026-06-11') }),
        ws,
        we,
      ),
    ).toBe(true);
  });

  test('左端だけ重なる（過去開始→ウィンドウ内終了）', () => {
    expect(
      overlapsWindow(
        makeTask({ startDate: new Date('2026-06-01'), endDate: new Date('2026-06-08') }),
        ws,
        we,
      ),
    ).toBe(true);
  });

  test('完全に過去なら重ならない', () => {
    expect(
      overlapsWindow(
        makeTask({ startDate: new Date('2026-06-01'), endDate: new Date('2026-06-05') }),
        ws,
        we,
      ),
    ).toBe(false);
  });

  test('日付未設定は重ならない', () => {
    expect(overlapsWindow(makeTask({}), ws, we)).toBe(false);
  });
});

describe('taskBarColumns', () => {
  const days = buildWeekWindow(new Date('2026-06-08')); // 6/8〜6/14

  test('ウィンドウ内の3日間バー', () => {
    const cols = taskBarColumns(
      makeTask({ startDate: new Date('2026-06-09'), endDate: new Date('2026-06-11') }),
      days,
    );
    expect(cols).toEqual({ startCol: 1, endCol: 3 });
  });

  test('過去にはみ出す分は左端クランプ', () => {
    const cols = taskBarColumns(
      makeTask({ startDate: new Date('2026-06-01'), endDate: new Date('2026-06-09') }),
      days,
    );
    expect(cols).toEqual({ startCol: 0, endCol: 1 });
  });

  test('未来にはみ出す分は右端クランプ', () => {
    const cols = taskBarColumns(
      makeTask({ startDate: new Date('2026-06-13'), endDate: new Date('2026-06-20') }),
      days,
    );
    expect(cols).toEqual({ startCol: 5, endCol: 6 });
  });

  test('ウィンドウ外は null', () => {
    expect(
      taskBarColumns(
        makeTask({ startDate: new Date('2026-07-01'), endDate: new Date('2026-07-03') }),
        days,
      ),
    ).toBeNull();
  });

  test('日付未設定は null', () => {
    expect(taskBarColumns(makeTask({}), days)).toBeNull();
  });
});

describe('taskBarBucketColumns', () => {
  test('月表示では週バケットへマッピングする', () => {
    const buckets = buildMonthBuckets(new Date('2026-06-08'));
    const cols = taskBarBucketColumns(
      makeTask({ startDate: new Date('2026-06-10'), endDate: new Date('2026-06-23') }),
      buckets,
    );
    expect(cols).toEqual({ startCol: 1, endCol: 3 });
  });

  test('年表示では月バケットへマッピングする', () => {
    const buckets = buildYearBuckets(new Date('2026-06-08'));
    const cols = taskBarBucketColumns(
      makeTask({ startDate: new Date('2026-02-15'), endDate: new Date('2026-04-01') }),
      buckets,
    );
    expect(cols).toEqual({ startCol: 1, endCol: 3 });
  });

  test('期間外と日付未設定は null', () => {
    const buckets = buildYearBuckets(new Date('2026-06-08'));
    expect(
      taskBarBucketColumns(
        makeTask({ startDate: new Date('2027-01-01'), endDate: new Date('2027-01-02') }),
        buckets,
      ),
    ).toBeNull();
    expect(taskBarBucketColumns(makeTask({}), buckets)).toBeNull();
  });
});

describe('filterTasksInWindow', () => {
  test('ウィンドウに重なるタスクのみ残す', () => {
    const days = buildWeekWindow(new Date('2026-06-08'));
    const tasks = [
      makeTask({ id: 'in', startDate: new Date('2026-06-09'), endDate: new Date('2026-06-10') }),
      makeTask({ id: 'past', startDate: new Date('2026-06-01'), endDate: new Date('2026-06-05') }),
      makeTask({ id: 'none' }), // 日付未設定
    ];
    expect(filterTasksInWindow(tasks, days).map((t) => t.id)).toEqual(['in']);
  });
});

describe('filterTasksInBuckets', () => {
  test('月バケットに重なるタスクのみ残す', () => {
    const buckets = buildMonthBuckets(new Date('2026-06-08'));
    const tasks = [
      makeTask({ id: 'in', startDate: new Date('2026-06-30'), endDate: new Date('2026-07-02') }),
      makeTask({ id: 'past', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-31') }),
      makeTask({ id: 'none' }),
    ];
    expect(filterTasksInBuckets(tasks, buckets).map((t) => t.id)).toEqual(['in']);
  });
});

describe('buildDashboardLanes', () => {
  const alice = makeMember({ id: 'a', name: 'アリス', order: 0 });
  const bob = makeMember({ id: 'b', name: 'ボブ', order: 1 });

  test('担当者ごとにレーン分け・複数担当は両方に出る・未設定は末尾', () => {
    const tasks = [
      makeTask({ id: 't1', assigneeIds: ['a'] }),
      makeTask({ id: 't2', assigneeIds: ['a', 'b'] }), // 両方に出る
      makeTask({ id: 't3', assigneeIds: [] }), // 未設定
    ];
    const lanes = buildDashboardLanes(tasks, [alice, bob]);
    expect(lanes).toHaveLength(3);
    expect(lanes[0].member?.id).toBe('a');
    expect(lanes[0].tasks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(lanes[1].member?.id).toBe('b');
    expect(lanes[1].tasks.map((t) => t.id)).toEqual(['t2']);
    expect(lanes[2].member).toBeNull(); // 未設定レーン
    expect(lanes[2].tasks.map((t) => t.id)).toEqual(['t3']);
  });

  test('タスクのない担当者レーンは含めない', () => {
    const tasks = [makeTask({ id: 't1', assigneeIds: ['a'] })];
    const lanes = buildDashboardLanes(tasks, [alice, bob]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0].member?.id).toBe('a');
  });

  test('未設定タスクが無ければ未設定レーンは出ない', () => {
    const tasks = [makeTask({ id: 't1', assigneeIds: ['a'] })];
    const lanes = buildDashboardLanes(tasks, [alice]);
    expect(lanes.every((l) => l.member !== null)).toBe(true);
  });
});
