// 横断ガントチャート用の純ロジック。
// 画面側は状態と描画に集中し、期間計算・分類・バー位置はここで固定する。

import type { ProcessMember, Project, Task } from '../../types/process';
import {
  addDays,
  addMonths,
  endOfMonth,
  startOfDay,
  startOfMonth,
  taskEffectiveRange,
} from './dashboard';
import { earlyCompletionSolidPercent, taskStatusFromColumn } from './gantt';

export type GanttGranularity = 'week' | 'month' | 'quarter';
export type OverviewTaskStatus = 'todo' | 'doing' | 'done' | 'hold';

export interface TimelineTick {
  key: string;
  label: string;
  subLabel: string;
  start: Date;
  end: Date;
}

export interface TimelineWindow {
  granularity: GanttGranularity;
  rangeStart: Date;
  rangeEnd: Date;
  ticks: TimelineTick[];
  totalDays: number;
}

export interface OverviewTask {
  task: Task;
  start: Date;
  end: Date;
  status: OverviewTaskStatus;
  columnName: string;
  assigneeText: string;
  left: number;
  width: number;
  earlyCompletionSolidPercent: number | null;
}

export interface UnplacedOverviewTask {
  task: Task;
  start: Date | null;
  end: Date | null;
  status: OverviewTaskStatus;
  columnName: string;
  assigneeText: string;
}

export interface ProjectOverviewTasks {
  visibleTasks: OverviewTask[];
  outOfRangeTasks: UnplacedOverviewTask[];
  unscheduledTasks: UnplacedOverviewTask[];
}

const WEEK_TICK_COUNT = 12;
const MONTH_TICK_COUNT = 6;
const QUARTER_TICK_COUNT = 4;
const DAY_MS = 86400000;

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shortDateLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function monthLabel(date: Date): string {
  return `${date.getFullYear()}/${date.getMonth() + 1}`;
}

function quarterOf(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const mondayOffset = (day.getDay() + 6) % 7;
  return addDays(day, -mondayOffset);
}

function startOfQuarter(date: Date): Date {
  const day = startOfDay(date);
  const quarterMonth = Math.floor(day.getMonth() / 3) * 3;
  return new Date(day.getFullYear(), quarterMonth, 1);
}

export function daysBetween(start: Date, end: Date): number {
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeTimelineStart(date: Date, granularity: GanttGranularity): Date {
  if (granularity === 'week') return startOfWeek(date);
  if (granularity === 'quarter') return startOfQuarter(date);
  return startOfMonth(date);
}

function buildWeekTicks(rangeStart: Date): TimelineTick[] {
  return Array.from({ length: WEEK_TICK_COUNT }, (_, index) => {
    const start = addDays(rangeStart, index * 7);
    const end = addDays(start, 6);
    return {
      key: `week:${dateKey(start)}`,
      label: `${shortDateLabel(start)}週`,
      subLabel: `${shortDateLabel(start)}-${shortDateLabel(end)}`,
      start,
      end,
    };
  });
}

function buildMonthTicks(rangeStart: Date): TimelineTick[] {
  return Array.from({ length: MONTH_TICK_COUNT }, (_, index) => {
    const start = addMonths(rangeStart, index);
    return {
      key: `month:${dateKey(start)}`,
      label: monthLabel(start),
      subLabel: `${start.getMonth() + 1}月`,
      start,
      end: endOfMonth(start),
    };
  });
}

function buildQuarterTicks(rangeStart: Date): TimelineTick[] {
  return Array.from({ length: QUARTER_TICK_COUNT }, (_, index) => {
    const start = addMonths(rangeStart, index * 3);
    const end = addDays(addMonths(start, 3), -1);
    return {
      key: `quarter:${dateKey(start)}`,
      label: `${start.getFullYear()} Q${quarterOf(start)}`,
      subLabel: `${start.getMonth() + 1}-${end.getMonth() + 1}月`,
      start,
      end,
    };
  });
}

export function buildTimelineWindow(anchorDate: Date, granularity: GanttGranularity): TimelineWindow {
  const rangeStart = normalizeTimelineStart(anchorDate, granularity);
  const ticks =
    granularity === 'week'
      ? buildWeekTicks(rangeStart)
      : granularity === 'quarter'
        ? buildQuarterTicks(rangeStart)
        : buildMonthTicks(rangeStart);
  const rangeEnd = ticks[ticks.length - 1]?.end ?? rangeStart;
  return {
    granularity,
    rangeStart,
    rangeEnd,
    ticks,
    totalDays: Math.max(1, daysBetween(rangeStart, rangeEnd) + 1),
  };
}

export function shiftTimelineStart(
  currentStart: Date,
  granularity: GanttGranularity,
  direction: -1 | 1,
): Date {
  if (granularity === 'week') return addDays(currentStart, direction * WEEK_TICK_COUNT * 7);
  if (granularity === 'quarter') return addMonths(currentStart, direction * QUARTER_TICK_COUNT * 3);
  return addMonths(currentStart, direction * MONTH_TICK_COUNT);
}

export function todayPositionPercent(window: TimelineWindow, today: Date): number | null {
  const target = startOfDay(today);
  if (target < window.rangeStart || target > window.rangeEnd) return null;
  return (daysBetween(window.rangeStart, target) / window.totalDays) * 100;
}

function memberNames(task: Task, memberById: Map<string, ProcessMember>): string {
  if (task.assigneeIds.length === 0) return '担当者なし';
  return task.assigneeIds.map((id) => memberById.get(id)?.name ?? '不明').join('、');
}

function taskMeta(project: Project, task: Task, memberById: Map<string, ProcessMember>) {
  const column = project.columns.find((item) => item.id === task.columnId) ?? null;
  return {
    status: taskStatusFromColumn(column),
    columnName: column?.name ?? '列なし',
    assigneeText: memberNames(task, memberById),
  };
}

function overlaps(range: { start: Date; end: Date }, window: TimelineWindow): boolean {
  return range.start <= window.rangeEnd && range.end >= window.rangeStart;
}

function toOverviewTask(
  project: Project,
  task: Task,
  range: { start: Date; end: Date },
  memberById: Map<string, ProcessMember>,
  window: TimelineWindow,
): OverviewTask {
  const startOffset = clamp(daysBetween(window.rangeStart, range.start), 0, window.totalDays - 1);
  const endOffset = clamp(daysBetween(window.rangeStart, range.end), 0, window.totalDays - 1);
  return {
    task,
    start: range.start,
    end: range.end,
    ...taskMeta(project, task, memberById),
    left: (startOffset / window.totalDays) * 100,
    width: Math.max(((endOffset - startOffset + 1) / window.totalDays) * 100, 2.5),
    earlyCompletionSolidPercent: earlyCompletionSolidPercent(range, task.completedDate),
  };
}

function toUnplacedTask(
  project: Project,
  task: Task,
  memberById: Map<string, ProcessMember>,
  range: { start: Date; end: Date } | null,
): UnplacedOverviewTask {
  return {
    task,
    start: range?.start ?? null,
    end: range?.end ?? null,
    ...taskMeta(project, task, memberById),
  };
}

export function buildProjectOverviewTasks(
  project: Project,
  tasks: readonly Task[],
  members: readonly ProcessMember[],
  window: TimelineWindow,
): ProjectOverviewTasks {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const visibleTasks: OverviewTask[] = [];
  const outOfRangeTasks: UnplacedOverviewTask[] = [];
  const unscheduledTasks: UnplacedOverviewTask[] = [];

  for (const task of tasks) {
    if (task.projectId !== project.id || task.archived || task.isArchived) continue;

    const range = taskEffectiveRange(task);
    if (!range) {
      unscheduledTasks.push(toUnplacedTask(project, task, memberById, null));
      continue;
    }

    if (!overlaps(range, window)) {
      outOfRangeTasks.push(toUnplacedTask(project, task, memberById, range));
      continue;
    }

    visibleTasks.push(toOverviewTask(project, task, range, memberById, window));
  }

  const byStartThenTitle = <T extends { start: Date | null; task: Task }>(a: T, b: T) => {
    const startDiff = (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0);
    if (startDiff !== 0) return startDiff;
    return a.task.title.localeCompare(b.task.title, 'ja');
  };

  visibleTasks.sort(byStartThenTitle);
  outOfRangeTasks.sort(byStartThenTitle);
  unscheduledTasks.sort((a, b) => a.task.title.localeCompare(b.task.title, 'ja'));

  return { visibleTasks, outOfRangeTasks, unscheduledTasks };
}
