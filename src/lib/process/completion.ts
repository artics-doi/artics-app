import type { ProjectColumn } from '../../types/process';
import { startOfDay } from './dashboard';

export function isDoneColumn(column: Pick<ProjectColumn, 'id' | 'name'> | null | undefined): boolean {
  if (!column) return false;
  return column.id === 'done' || column.name.includes('完了');
}

export function isDoneColumnId(columns: readonly Pick<ProjectColumn, 'id' | 'name'>[], columnId: string): boolean {
  return isDoneColumn(columns.find((column) => column.id === columnId));
}

export function defaultCompletedDate(today: Date = new Date()): Date {
  return startOfDay(today);
}
