import type { ScheduleEvent, ScheduleNotificationTiming } from '../types/schedule';
import { SCHEDULE_CATEGORY_BY_ID } from '../constants/schedule';

export const SCHEDULE_NOTIFICATION_GRACE_MS = 5 * 60 * 1000;

function withTime(date: Date, hours: number, minutes: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

export function getScheduleNotificationTime(event: ScheduleEvent, timing: ScheduleNotificationTiming): Date | null {
  if (timing === 'custom') return event.notification.customAt;

  if (event.allDay) {
    const startDay = new Date(event.startAt.getFullYear(), event.startAt.getMonth(), event.startAt.getDate());
    if (timing === 'previousDayEvening') {
      const previousDay = new Date(startDay);
      previousDay.setDate(previousDay.getDate() - 1);
      return withTime(previousDay, 17, 0);
    }
    return withTime(startDay, 8, 30);
  }

  const startAt = event.startAt;
  switch (timing) {
    case 'atStart':
      return startAt;
    case 'fiveMinutesBefore':
      return new Date(startAt.getTime() - 5 * 60 * 1000);
    case 'fifteenMinutesBefore':
      return new Date(startAt.getTime() - 15 * 60 * 1000);
    case 'thirtyMinutesBefore':
      return new Date(startAt.getTime() - 30 * 60 * 1000);
    case 'oneHourBefore':
      return new Date(startAt.getTime() - 60 * 60 * 1000);
    case 'previousDayEvening': {
      const previousDay = new Date(startAt);
      previousDay.setDate(previousDay.getDate() - 1);
      return withTime(previousDay, 17, 0);
    }
    case 'sameDayMorning':
      return withTime(startAt, 8, 30);
    default:
      return null;
  }
}

export function getScheduleNotificationKey(event: ScheduleEvent, timing: ScheduleNotificationTiming, notifyAt: Date): string {
  return `${event.id}:${timing}:${notifyAt.getTime()}`;
}

export function formatScheduleNotificationBody(event: ScheduleEvent): string {
  const category = SCHEDULE_CATEGORY_BY_ID[event.categoryId]?.label ?? '予定';
  const targetUsers = event.targetUserNames.length > 0 ? ` / ${event.targetUserNames.join('、')}` : '';
  return `${event.title}${targetUsers} (${category})`;
}
