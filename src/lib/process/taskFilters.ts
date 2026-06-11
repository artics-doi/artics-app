import type { Task } from '../../types/process';

export type TaskDateFilter = 'all' | 'complete' | 'missing';

export interface TaskFilterState {
  query: string;
  assigneeId: string;
  columnId: string;
  dateFilter: TaskDateFilter;
  missingOnly: boolean;
}

export interface TaskMissingCheck {
  assignee: boolean;
  startDate: boolean;
  endDate: boolean;
}

export const EMPTY_TASK_FILTERS: TaskFilterState = {
  query: '',
  assigneeId: 'all',
  columnId: 'all',
  dateFilter: 'all',
  missingOnly: false,
};

export function getTaskMissingCheck(task: Task): TaskMissingCheck {
  return {
    assignee: task.assigneeIds.length === 0,
    startDate: task.startDate === null,
    endDate: task.endDate === null,
  };
}

export function hasTaskMissingFields(task: Task): boolean {
  const missing = getTaskMissingCheck(task);
  return missing.assignee || missing.startDate || missing.endDate;
}

export function taskMatchesFilters(task: Task, filters: TaskFilterState): boolean {
  const normalizedQuery = filters.query.trim().toLowerCase();
  if (normalizedQuery) {
    const haystack = `${task.title}\n${task.description}`.toLowerCase();
    if (!haystack.includes(normalizedQuery)) return false;
  }

  if (filters.assigneeId === 'unassigned') {
    if (task.assigneeIds.length > 0) return false;
  } else if (filters.assigneeId !== 'all' && !task.assigneeIds.includes(filters.assigneeId)) {
    return false;
  }

  if (filters.columnId !== 'all' && task.columnId !== filters.columnId) {
    return false;
  }

  if (filters.dateFilter === 'complete' && (!task.startDate || !task.endDate)) {
    return false;
  }

  if (filters.dateFilter === 'missing' && task.startDate && task.endDate) {
    return false;
  }

  if (filters.missingOnly && !hasTaskMissingFields(task)) {
    return false;
  }

  return true;
}

export function filterTasks(tasks: readonly Task[], filters: TaskFilterState): Task[] {
  return tasks.filter((task) => taskMatchesFilters(task, filters));
}
