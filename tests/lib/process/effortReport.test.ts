import { describe, expect, test } from 'vitest';
import {
  buildEffortReport,
  buildFiscalYearPeriod,
  businessDaysInRange,
  compressEffortDailyDetails,
  DEFAULT_HOURS_PER_BUSINESS_DAY,
  effortReportFileName,
  scheduleHolidayDateKeys,
} from '../../../src/lib/process/effortReport';
import type { Project, ProcessMember, Task } from '../../../src/types/process';
import type { ScheduleEvent } from '../../../src/types/schedule';

function d(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

function key(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function project(partial: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'PJ',
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
    createdBy: 'u',
    createdByName: 'U',
    createdAt: null,
    updatedAt: null,
    ...partial,
  };
}

function member(partial: Partial<ProcessMember> = {}): ProcessMember {
  return {
    id: 'm1',
    name: '山田',
    colorIndex: 0,
    order: 0,
    linkedUserId: null,
    ...partial,
  };
}

function task(partial: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: '実装',
    projectId: 'p1',
    columnId: 'doing',
    assigneeIds: ['m1'],
    startDate: d(2026, 8, 3),
    endDate: d(2026, 8, 3),
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

function holiday(date: Date): ScheduleEvent {
  return {
    id: `h-${key(date)}`,
    title: '休日',
    categoryId: 'holiday',
    targetUserIds: ['someone'],
    targetUserNames: ['誰か'],
    startAt: date,
    endAt: null,
    allDay: true,
    memo: '',
    notification: { enabled: false, timings: [], customAt: null },
    createdBy: 'u',
    createdByName: 'U',
    createdAt: null,
    updatedAt: null,
  };
}

describe('buildFiscalYearPeriod', () => {
  test('8月始まり年度の境界を返す', () => {
    const period = buildFiscalYearPeriod(2026);
    expect(period.start).toEqual(d(2026, 8, 1));
    expect(period.end).toEqual(d(2027, 7, 31));
    expect(effortReportFileName(period)).toBe('開発工数_2026年度_20260801-20270731.pdf');
  });
});

describe('businessDaysInRange / scheduleHolidayDateKeys', () => {
  test('土日と行動予定表の休日を除外する', () => {
    const period = buildFiscalYearPeriod(2026);
    const holidays = scheduleHolidayDateKeys([holiday(d(2026, 8, 4))], period);
    const days = businessDaysInRange(d(2026, 8, 1), d(2026, 8, 7), holidays);
    expect(days.map(key)).toEqual([
      '2026-08-03',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ]);
  });
});

describe('buildEffortReport', () => {
  test('年度に1日だけ重なるタスクを自動集計する', () => {
    const report = buildEffortReport({
      fiscalYear: 2026,
      projects: [project()],
      members: [member()],
      tasks: [task({ startDate: d(2026, 7, 31), endDate: d(2026, 8, 3) })],
      schedules: [],
    });
    expect(report.totalHours).toBe(8);
    expect(report.hoursPerBusinessDay).toBe(DEFAULT_HOURS_PER_BUSINESS_DAY);
    expect(report.projects[0].memberSummaries[0].businessDays).toBe(1);
  });

  test('同日複数タスクは8時間を均等割りする', () => {
    const report = buildEffortReport({
      fiscalYear: 2026,
      projects: [project()],
      members: [member()],
      tasks: [
        task({ id: 't1', title: 'A', startDate: d(2026, 8, 3), endDate: d(2026, 8, 3) }),
        task({ id: 't2', title: 'B', startDate: d(2026, 8, 3), endDate: d(2026, 8, 3) }),
      ],
      schedules: [],
    });
    const summary = report.projects[0].memberSummaries[0];
    expect(summary.totalHours).toBe(8);
    expect(summary.taskDetails.map((detail) => detail.hours)).toEqual([4, 4]);
    expect(summary.dailyDetails.map((detail) => ({
      dateKey: detail.dateKey,
      taskId: detail.taskId,
      hours: detail.hours,
    }))).toEqual([
      { dateKey: '2026-08-03', taskId: 't1', hours: 4 },
      { dateKey: '2026-08-03', taskId: 't2', hours: 4 },
    ]);
    expect(summary.unallocatedHours).toBe(0);
  });

  test('1日あたりの工数を変更して集計できる', () => {
    const report = buildEffortReport({
      fiscalYear: 2026,
      projects: [project()],
      members: [member()],
      tasks: [
        task({ id: 't1', title: 'A', startDate: d(2026, 8, 3), endDate: d(2026, 8, 3) }),
        task({ id: 't2', title: 'B', startDate: d(2026, 8, 3), endDate: d(2026, 8, 3) }),
      ],
      schedules: [],
      hoursPerBusinessDay: 7.5,
    });
    const summary = report.projects[0].memberSummaries[0];
    expect(report.hoursPerBusinessDay).toBe(7.5);
    expect(report.totalHours).toBe(7.5);
    expect(summary.businessDays).toBe(1);
    expect(summary.taskDetails.map((detail) => detail.hours)).toEqual([3.75, 3.75]);
    expect(summary.dailyDetails.map((detail) => detail.hours)).toEqual([3.75, 3.75]);
  });

  test('進行中と完了だけを内訳対象にする', () => {
    const report = buildEffortReport({
      fiscalYear: 2026,
      projects: [project()],
      members: [member()],
      tasks: [
        task({ id: 'doing', columnId: 'doing', title: '進行' }),
        task({ id: 'done', columnId: 'done', title: '完了' }),
        task({ id: 'todo', columnId: 'todo', title: '未着手' }),
        task({ id: 'hold', columnId: 'hold', title: '保留' }),
      ],
      schedules: [],
    });
    expect(report.projects[0].memberSummaries[0].taskDetails.map((detail) => detail.taskId)).toEqual([
      'doing',
      'done',
    ]);
  });

  test('タスク日付不足は警告して内訳対象外', () => {
    const report = buildEffortReport({
      fiscalYear: 2026,
      projects: [project()],
      members: [member()],
      tasks: [task({ startDate: null, endDate: d(2026, 8, 3) })],
      schedules: [],
    });
    expect(report.projects).toHaveLength(0);
    expect(report.issues.some((issue) => issue.id.startsWith('task:missing-date'))).toBe(true);
  });

  test('タスクがなければエラーなしで空集計にする', () => {
    const report = buildEffortReport({
      fiscalYear: 2026,
      projects: [project()],
      members: [member()],
      tasks: [],
      schedules: [],
    });
    expect(report.issues.some((issue) => issue.severity === 'error')).toBe(false);
  });

  test('明細は連続する営業日を1行に圧縮する', () => {
    const report = buildEffortReport({
      fiscalYear: 2026,
      projects: [project()],
      members: [member()],
      tasks: [task({ startDate: d(2026, 8, 7), endDate: d(2026, 8, 11) })],
      schedules: [holiday(d(2026, 8, 10))],
    });
    const details = compressEffortDailyDetails(report);
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({
      startDateKey: '2026-08-07',
      endDateKey: '2026-08-11',
      days: 2,
      totalHours: 16,
    });
  });

  test('同じタスクでも日あたり工数が変わる場合は明細を分ける', () => {
    const report = buildEffortReport({
      fiscalYear: 2026,
      projects: [project()],
      members: [member()],
      tasks: [
        task({ id: 't1', title: 'A', startDate: d(2026, 8, 3), endDate: d(2026, 8, 4) }),
        task({ id: 't2', title: 'B', startDate: d(2026, 8, 3), endDate: d(2026, 8, 3) }),
      ],
      schedules: [],
    });
    const details = compressEffortDailyDetails(report).filter((detail) => detail.taskId === 't1');
    expect(details.map((detail) => ({
      startDateKey: detail.startDateKey,
      endDateKey: detail.endDateKey,
      days: detail.days,
      totalHours: detail.totalHours,
    }))).toEqual([
      { startDateKey: '2026-08-03', endDateKey: '2026-08-03', days: 1, totalHours: 4 },
      { startDateKey: '2026-08-04', endDateKey: '2026-08-04', days: 1, totalHours: 8 },
    ]);
  });
});
