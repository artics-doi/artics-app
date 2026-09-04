import type { ScheduleCategoryId, ScheduleEvent } from '../../types/schedule';

export function filterSchedulesByCategories(
  schedules: readonly ScheduleEvent[],
  categoryIds: readonly ScheduleCategoryId[],
): ScheduleEvent[] {
  if (categoryIds.length === 0) return [...schedules];
  const selected = new Set(categoryIds);
  return schedules.filter((event) => selected.has(event.categoryId));
}
