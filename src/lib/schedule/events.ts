// 行動予定表のイベント並び替え・週レイアウト・複製の純ロジック。
// Schedule.tsx から機械的に移動（挙動変更なし）。React や Firestore に依存しない。

import type { ScheduleCategoryId, ScheduleEvent, ScheduleEventInput } from '../../types/schedule';
import {
  DAY_MS,
  endOfDay,
  formatDayLabel,
  getCalendarDayDiff,
  isSameDay,
  shiftDateByDayDiff,
  startOfDay,
  toOrderDateKey,
  toTimeInputValue,
} from './calendar';

export type CalendarWeekEvent = {
  event: ScheduleEvent;
  startColumn: number;
  endColumn: number;
  lane: number;
};

export const CATEGORY_SORT_PRIORITY: ScheduleCategoryId[] = [
  'holiday',
  'outing',
  'fieldwork',
  'businessTrip',
  'vehicle',
  'vehicleOuting',
  'smallMeetingRoom',
  'largeMeetingRoom',
  'internalEvent',
  'maintenance',
  'other',
  'vacation',
];
export const CATEGORY_SORT_ORDER = new Map(
  CATEGORY_SORT_PRIORITY.map((categoryId, index) => [categoryId, index]),
);

export function eventEndForComparison(event: ScheduleEvent): Date {
  return event.endAt ?? event.startAt;
}

export function getEventDurationDays(event: ScheduleEvent): number {
  const start = startOfDay(event.startAt).getTime();
  const end = startOfDay(eventEndForComparison(event)).getTime();
  return Math.max(1, Math.floor((end - start) / DAY_MS) + 1);
}

export function isMultiDayEvent(event: ScheduleEvent): boolean {
  return getEventDurationDays(event) > 1;
}

export function eventIntersectsDay(event: ScheduleEvent, day: Date): boolean {
  return event.startAt <= endOfDay(day) && eventEndForComparison(event) >= startOfDay(day);
}

export function eventIntersectsRange(event: ScheduleEvent, start: Date, end: Date): boolean {
  return event.startAt <= endOfDay(end) && eventEndForComparison(event) >= startOfDay(start);
}

export function formatEventTime(event: ScheduleEvent): string {
  if (event.allDay) {
    if (event.endAt && !isSameDay(event.startAt, event.endAt)) {
      return `${formatDayLabel(event.startAt)} - ${formatDayLabel(event.endAt)}`;
    }
    return '終日';
  }

  const start = toTimeInputValue(event.startAt);
  const end = event.endAt && !isSameDay(event.startAt, event.endAt)
    ? `${formatDayLabel(event.endAt)} ${toTimeInputValue(event.endAt)}`
    : event.endAt
      ? toTimeInputValue(event.endAt)
      : '';
  return end ? `${start} - ${end}` : start;
}

export function compareSchedules(a: ScheduleEvent, b: ScheduleEvent): number {
  const multiDayDiff = Number(isMultiDayEvent(b)) - Number(isMultiDayEvent(a));
  if (multiDayDiff !== 0) return multiDayDiff;

  const durationDiff = getEventDurationDays(b) - getEventDurationDays(a);
  if (durationDiff !== 0) return durationDiff;

  const aOrderDate = toOrderDateKey(a.startAt);
  const bOrderDate = toOrderDateKey(b.startAt);
  const aHasManualOrder = a.manualOrderDate === aOrderDate && typeof a.manualOrder === 'number';
  const bHasManualOrder = b.manualOrderDate === bOrderDate && typeof b.manualOrder === 'number';
  if (aOrderDate === bOrderDate && (aHasManualOrder || bHasManualOrder)) {
    const aManualOrder = a.manualOrder ?? 0;
    const bManualOrder = b.manualOrder ?? 0;
    if (aHasManualOrder && bHasManualOrder && aManualOrder !== bManualOrder) {
      return aManualOrder - bManualOrder;
    }
    if (aHasManualOrder !== bHasManualOrder) return aHasManualOrder ? -1 : 1;
  }

  const allDayDiff = Number(b.allDay) - Number(a.allDay);
  if (allDayDiff !== 0) return allDayDiff;

  const startDiff = a.startAt.getTime() - b.startAt.getTime();
  if (startDiff !== 0) return startDiff;

  const categoryDiff = (CATEGORY_SORT_ORDER.get(a.categoryId) ?? 999) - (CATEGORY_SORT_ORDER.get(b.categoryId) ?? 999);
  if (categoryDiff !== 0) return categoryDiff;

  const titleDiff = a.title.localeCompare(b.title, 'ja');
  if (titleDiff !== 0) return titleDiff;

  const createdDiff = (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
  if (createdDiff !== 0) return createdDiff;

  return a.id.localeCompare(b.id);
}

export function buildWeekEvents(events: ScheduleEvent[], weekDays: Date[]): CalendarWeekEvent[] {
  const weekStart = weekDays[0];
  const weekEnd = weekDays[weekDays.length - 1];
  const laneEndColumns: number[] = [];

  return events
    .filter((event) => eventIntersectsRange(event, weekStart, weekEnd))
    .map((event) => {
      const eventStart = startOfDay(event.startAt);
      const eventEnd = startOfDay(eventEndForComparison(event));
      const startColumn = Math.max(1, Math.min(7, Math.floor((eventStart.getTime() - weekStart.getTime()) / DAY_MS) + 1));
      const endColumn = Math.max(1, Math.min(7, Math.floor((eventEnd.getTime() - weekStart.getTime()) / DAY_MS) + 1));
      return { event, startColumn, endColumn };
    })
    .sort((a, b) => (
      a.startColumn - b.startColumn ||
      compareSchedules(a.event, b.event) ||
      a.endColumn - b.endColumn
    ))
    .map(({ event, startColumn, endColumn }) => {
      const lane = laneEndColumns.findIndex((endColumnInLane) => startColumn > endColumnInLane);
      const resolvedLane = lane === -1 ? laneEndColumns.length : lane;
      laneEndColumns[resolvedLane] = endColumn;
      return { event, startColumn, endColumn, lane: resolvedLane };
    });
}

export function getDayMultiLaneCount(weekEvents: CalendarWeekEvent[], dayIndex: number): number {
  const dayColumn = dayIndex + 1;
  const intersectingLanes = weekEvents
    .filter(({ startColumn, endColumn }) => startColumn <= dayColumn && endColumn >= dayColumn)
    .map(({ lane }) => lane);
  return intersectingLanes.length > 0 ? Math.max(...intersectingLanes) + 1 : 0;
}

export function getSingleDayEventsForOrder(events: ScheduleEvent[], dateKey: string): ScheduleEvent[] {
  return events
    .filter((event) => !isMultiDayEvent(event) && toOrderDateKey(event.startAt) === dateKey)
    .sort(compareSchedules);
}

export function copyScheduleToDate(source: ScheduleEvent, targetDate: Date): ScheduleEventInput {
  const startAt = shiftDateByDayDiff(source.startAt, targetDate, 0, source.allDay);
  const endDayDiff = source.endAt ? getCalendarDayDiff(source.startAt, source.endAt) : 0;
  const endAt = source.endAt
    ? shiftDateByDayDiff(source.endAt, targetDate, endDayDiff, source.allDay, true)
    : source.allDay
      ? null
      : shiftDateByDayDiff(source.startAt, targetDate, 0, false);
  const customNotifyDayDiff = source.notification.customAt
    ? getCalendarDayDiff(source.startAt, source.notification.customAt)
    : 0;
  const customAt = source.notification.customAt
    ? shiftDateByDayDiff(source.notification.customAt, targetDate, customNotifyDayDiff, false)
    : null;

  return {
    title: source.title,
    categoryId: source.categoryId,
    targetUserIds: source.targetUserIds,
    targetUserNames: source.targetUserNames,
    startAt,
    endAt,
    allDay: source.allDay,
    memo: source.memo,
    notification: {
      enabled: source.notification.enabled,
      timings: source.notification.enabled ? source.notification.timings : [],
      customAt: source.notification.enabled ? customAt : null,
    },
  };
}
