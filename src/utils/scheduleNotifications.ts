import type { ScheduleEvent, ScheduleNotificationTiming } from '../types/schedule';
import { SCHEDULE_CATEGORY_BY_ID } from '../constants/schedule';

export const SCHEDULE_NOTIFICATION_GRACE_MS = 5 * 60 * 1000;

export function resolveScheduleNotificationCustomAt(
  timing: ScheduleNotificationTiming,
  customAt: Date | null,
  savedAt: Date = new Date(),
): Date | null {
  if (timing === 'atStart') return savedAt;
  if (timing === 'custom') return customAt;
  return null;
}

function withTime(date: Date, hours: number, minutes: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

export function getScheduleNotificationTime(event: ScheduleEvent, timing: ScheduleNotificationTiming): Date | null {
  // 新規・更新した予定は customAt に保存時刻を保持する。旧データは開始時刻へフォールバックする。
  if (timing === 'atStart') return event.notification.customAt ?? event.startAt;
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

function formatScheduleDate(date: Date): string {
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日（${weekday}）`;
}

function formatScheduleTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatScheduleNotificationDateTime(event: ScheduleEvent): string {
  const startDate = formatScheduleDate(event.startAt);
  if (event.allDay) {
    if (event.endAt && formatScheduleDate(event.endAt) !== startDate) {
      return `${startDate}〜${formatScheduleDate(event.endAt)} 終日`;
    }
    return `${startDate} 終日`;
  }

  const startTime = formatScheduleTime(event.startAt);
  if (!event.endAt) return `${startDate} ${startTime}`;
  if (formatScheduleDate(event.endAt) !== startDate) {
    return `${startDate} ${startTime}〜${formatScheduleDate(event.endAt)} ${formatScheduleTime(event.endAt)}`;
  }
  return `${startDate} ${startTime}〜${formatScheduleTime(event.endAt)}`;
}

export function formatScheduleNotificationBody(event: ScheduleEvent): string {
  const category = SCHEDULE_CATEGORY_BY_ID[event.categoryId]?.label ?? 'その他';
  const targetUsers = event.targetUserNames.length > 0
    ? event.targetUserNames.join('、')
    : event.createdByName || '未設定';
  return `🏷 カテゴリ：${category}\n📅 ${formatScheduleNotificationDateTime(event)}\n👥 対象：${targetUsers}`;
}
