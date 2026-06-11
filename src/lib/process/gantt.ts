// Firestore の Task と SVAR React Gantt のデータ形状を相互変換する。
// ガント固有の日付仕様はこのファイルに閉じ込める。

import type { IScaleConfig, ITask } from '@svar-ui/react-gantt';
import type { ProcessMember, ProjectColumn, Task } from '../../types/process';
import { addDays, startOfDay, taskEffectiveRange } from './dashboard';

export type GanttViewMode = 'day' | 'week' | 'month';
export type GanttSortMode = 'todo-first' | 'start-asc' | 'end-asc' | 'assignee' | 'status';

export interface ProcessGanttTask extends ITask {
  id: string;
  sourceTaskId: string;
  text: string;
  start: Date;
  end: Date;
  type: 'task';
  columnName: string;
  assigneeText: string;
  processStatus: 'todo' | 'doing' | 'done' | 'hold';
  ganttOrder: string;
  css: string;
}

export interface GanttAdapterResult {
  tasks: ProcessGanttTask[];
  unscheduledTasks: Task[];
}

export function taskStatusFromColumn(column: Pick<ProjectColumn, 'id' | 'name'> | null): ProcessGanttTask['processStatus'] {
  if (!column) return 'todo';
  if (column.id === 'done') return 'done';
  if (column.id === 'hold') return 'hold';
  if (column.id === 'doing') return 'doing';
  if (column.name.includes('完了')) return 'done';
  if (column.name.includes('保留')) return 'hold';
  if (column.name.includes('進行') || column.name.includes('対応')) return 'doing';
  return 'todo';
}

export function formatProcessDate(date: Date | null): string {
  if (!date) return '未設定';
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function columnNameOf(task: Task, columns: readonly ProjectColumn[]): string {
  return columns.find((column) => column.id === task.columnId)?.name ?? '列なし';
}

function columnOf(task: Task, columns: readonly ProjectColumn[]): ProjectColumn | null {
  return columns.find((column) => column.id === task.columnId) ?? null;
}

function assigneeTextOf(task: Task, memberById: Map<string, ProcessMember>): string {
  if (task.assigneeIds.length === 0) return '未設定';
  return task.assigneeIds.map((id) => memberById.get(id)?.name ?? '不明な担当者').join(', ');
}

export function toProcessGanttData(
  tasks: readonly Task[],
  columns: readonly ProjectColumn[],
  members: readonly ProcessMember[],
): GanttAdapterResult {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const ganttTasks: ProcessGanttTask[] = [];
  const unscheduledTasks: Task[] = [];

  for (const task of tasks) {
    const range = taskEffectiveRange(task);
    if (!range) {
      unscheduledTasks.push(task);
      continue;
    }

    const column = columnOf(task, columns);
    const columnName = column?.name ?? columnNameOf(task, columns);
    const processStatus = taskStatusFromColumn(column);
    ganttTasks.push({
      id: task.id,
      sourceTaskId: task.id,
      text: task.title,
      start: startOfDay(range.start),
      // SVAR の day 表示では end を翌日にして、Firestore の終了日を含む期間に合わせる。
      end: addDays(range.end, 1),
      duration: Math.max(1, Math.round((startOfDay(range.end).getTime() - startOfDay(range.start).getTime()) / 86400000) + 1),
      type: 'task',
      progress: processStatus === 'done' ? 100 : processStatus === 'doing' ? 50 : 0,
      details: task.description,
      columnName,
      assigneeText: assigneeTextOf(task, memberById),
      processStatus,
      ganttOrder: task.ganttOrder,
      css: `articsGanttTask-${processStatus}`,
      open: false,
    });
  }

  return {
    tasks: ganttTasks.sort((a, b) => {
      if (a.ganttOrder !== b.ganttOrder) return a.ganttOrder < b.ganttOrder ? -1 : 1;
      if (a.start.getTime() !== b.start.getTime()) return a.start.getTime() - b.start.getTime();
      return a.text.localeCompare(b.text, 'ja');
    }),
    unscheduledTasks,
  };
}

function compareByGanttOrder(a: ProcessGanttTask, b: ProcessGanttTask): number {
  if (a.ganttOrder !== b.ganttOrder) return a.ganttOrder < b.ganttOrder ? -1 : 1;
  if (a.start.getTime() !== b.start.getTime()) return a.start.getTime() - b.start.getTime();
  return a.text.localeCompare(b.text, 'ja');
}

function compareByDateThenOrder(
  a: ProcessGanttTask,
  b: ProcessGanttTask,
  dateOf: (task: ProcessGanttTask) => Date,
): number {
  const dateDiff = dateOf(a).getTime() - dateOf(b).getTime();
  return dateDiff !== 0 ? dateDiff : compareByGanttOrder(a, b);
}

const STATUS_SORT_RANK: Record<ProcessGanttTask['processStatus'], number> = {
  todo: 0,
  doing: 1,
  done: 2,
  hold: 3,
};

const TODO_FIRST_RANK: Record<ProcessGanttTask['processStatus'], number> = {
  todo: 0,
  doing: 1,
  hold: 2,
  done: 3,
};

export function sortProcessGanttTasks(
  tasks: readonly ProcessGanttTask[],
  mode: GanttSortMode,
): ProcessGanttTask[] {
  const sorted = [...tasks];
  if (mode === 'start-asc') return sorted.sort((a, b) => compareByDateThenOrder(a, b, (task) => task.start));
  if (mode === 'end-asc') return sorted.sort((a, b) => compareByDateThenOrder(a, b, (task) => task.end));
  if (mode === 'assignee') {
    return sorted.sort((a, b) => {
      const assigneeDiff = a.assigneeText.localeCompare(b.assigneeText, 'ja');
      return assigneeDiff !== 0 ? assigneeDiff : compareByGanttOrder(a, b);
    });
  }
  if (mode === 'status') {
    return sorted.sort((a, b) => {
      const statusDiff = STATUS_SORT_RANK[a.processStatus] - STATUS_SORT_RANK[b.processStatus];
      return statusDiff !== 0 ? statusDiff : compareByGanttOrder(a, b);
    });
  }
  return sorted.sort((a, b) => {
    const statusDiff = TODO_FIRST_RANK[a.processStatus] - TODO_FIRST_RANK[b.processStatus];
    return statusDiff !== 0 ? statusDiff : compareByGanttOrder(a, b);
  });
}

export function buildReorderedGanttTaskIds(
  tasks: readonly Pick<ProcessGanttTask, 'id'>[],
  activeId: string,
  overId: string,
): string[] {
  const oldIndex = tasks.findIndex((task) => task.id === activeId);
  const newIndex = tasks.findIndex((task) => task.id === overId);
  if (activeId === overId || oldIndex < 0 || newIndex < 0) {
    return tasks.map((task) => task.id);
  }

  const reordered = [...tasks];
  const [moved] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, moved);
  return reordered.map((task) => task.id);
}

export function ganttDatesToTaskDates(
  start: Date | undefined,
  end: Date | undefined,
): { startDate: Date | null; endDate: Date | null } | null {
  if (!start && !end) return null;
  const startDate = start ? startOfDay(start) : end ? startOfDay(end) : null;
  const rawEnd = end ? addDays(startOfDay(end), -1) : startDate;
  const endDate = startDate && rawEnd && rawEnd.getTime() < startDate.getTime() ? startDate : rawEnd;
  return { startDate, endDate };
}

function taskEndDateFromGanttEnd(end: Date): Date {
  return addDays(startOfDay(end), -1);
}

function hasSameTaskDates(
  a: { startDate: Date | null; endDate: Date | null },
  b: { startDate: Date | null; endDate: Date | null },
): boolean {
  return (
    (a.startDate?.getTime() ?? null) === (b.startDate?.getTime() ?? null) &&
    (a.endDate?.getTime() ?? null) === (b.endDate?.getTime() ?? null)
  );
}

function normalizeTaskDates(startDate: Date | null, endDate: Date | null) {
  if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
    return { startDate, endDate: startDate };
  }
  return { startDate, endDate };
}

export function resolveGanttUpdateTaskDates(
  source: Pick<Task, 'startDate' | 'endDate'>,
  update: {
    start?: Date;
    end?: Date;
    diff?: number;
  },
  live?: {
    start?: Date;
    end?: Date;
  },
): { startDate: Date | null; endDate: Date | null } | null {
  const sourceDates = {
    startDate: source.startDate,
    endDate: source.endDate,
  };
  const hasPatchStart = update.start instanceof Date;
  const hasPatchEnd = update.end instanceof Date;
  const diff = Number.isFinite(update.diff) ? update.diff ?? 0 : 0;

  if (hasPatchStart || hasPatchEnd) {
    const patchDates = normalizeTaskDates(
      hasPatchStart ? startOfDay(update.start as Date) : source.startDate,
      hasPatchEnd ? taskEndDateFromGanttEnd(update.end as Date) : source.endDate,
    );
    if (!hasSameTaskDates(sourceDates, patchDates) || diff === 0) {
      return patchDates;
    }

    if (diff !== 0) {
      return normalizeTaskDates(
        hasPatchStart && source.startDate ? addDays(source.startDate, diff) : source.startDate,
        hasPatchEnd && source.endDate ? addDays(source.endDate, diff) : source.endDate,
      );
    }
  }

  const liveDates = live ? ganttDatesToTaskDates(live.start, live.end) : null;
  if (liveDates && !hasSameTaskDates(sourceDates, liveDates)) {
    return liveDates;
  }

  return null;
}

function addMonths(date: Date, months: number): Date {
  const d = startOfDay(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function ganttDragGeometryToTaskDates(
  geometry: {
    left: number;
    width: number;
  },
  scaleStart: Date,
  cellWidth: number,
  viewMode: GanttViewMode,
): { startDate: Date; endDate: Date } | null {
  if (cellWidth <= 0 || geometry.width <= 0) return null;

  if (viewMode === 'month') {
    const startOffset = Math.max(0, Math.round(geometry.left / cellWidth));
    const duration = Math.max(1, Math.round(geometry.width / cellWidth));
    const startDate = addMonths(scaleStart, startOffset);
    return {
      startDate,
      endDate: addDays(addMonths(startDate, duration), -1),
    };
  }

  const daysPerCell = viewMode === 'week' ? 7 : 1;
  const startOffset = Math.max(0, Math.round((geometry.left / cellWidth) * daysPerCell));
  const duration = Math.max(1, Math.round((geometry.width / cellWidth) * daysPerCell));
  const startDate = addDays(scaleStart, startOffset);
  return {
    startDate,
    endDate: addDays(startDate, duration - 1),
  };
}

export function buildGanttTimelineBounds(
  ganttTasks: readonly ProcessGanttTask[],
  today: Date,
): { start: Date; end: Date } {
  const starts = ganttTasks.map((task) => startOfDay(task.start).getTime());
  const ends = ganttTasks.map((task) => startOfDay(task.end).getTime());
  const todayStart = startOfDay(today).getTime();
  const min = Math.min(todayStart, ...starts);
  const max = Math.max(addDays(today, 14).getTime(), ...ends);
  return {
    start: addDays(new Date(min), -3),
    end: addDays(new Date(max), 7),
  };
}

export function ganttScalesForMode(mode: GanttViewMode): IScaleConfig[] {
  if (mode === 'month') {
    return [
      { unit: 'year', step: 1, format: (date) => `${date.getFullYear()}年` },
      { unit: 'month', step: 1, format: (date) => `${date.getMonth() + 1}月` },
    ];
  }
  if (mode === 'week') {
    return [
      { unit: 'month', step: 1, format: (date) => `${date.getFullYear()}年${date.getMonth() + 1}月` },
      { unit: 'week', step: 1, format: (date) => `${date.getMonth() + 1}/${date.getDate()}週` },
    ];
  }
  return [
    { unit: 'month', step: 1, format: (date) => `${date.getFullYear()}年${date.getMonth() + 1}月` },
    { unit: 'day', step: 1, format: (date) => `${date.getDate()}日` },
  ];
}
