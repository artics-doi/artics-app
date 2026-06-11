// 行動予定表の通知タイミング計算。index.ts から機械的に移動（挙動変更なし）。
// クライアント側 src/utils/scheduleNotifications.ts と同じ仕様（前日17時 / 当日8時30分）。

import type { Timestamp } from 'firebase-admin/firestore';

export type ScheduleNotificationTiming =
  | 'atStart'
  | 'fiveMinutesBefore'
  | 'fifteenMinutesBefore'
  | 'thirtyMinutesBefore'
  | 'oneHourBefore'
  | 'previousDayEvening'
  | 'sameDayMorning'
  | 'custom';

export interface ScheduleData {
  title?: string;
  categoryId?: string;
  targetUserIds?: string[];
  targetUserNames?: string[];
  startAt?: Timestamp;
  endAt?: Timestamp | null;
  allDay?: boolean;
  createdBy?: string;
  notification?: {
    enabled?: boolean;
    timings?: ScheduleNotificationTiming[];
    customAt?: Timestamp | null;
  };
  sentNotificationKeys?: string[];
}

export const SCHEDULE_NOTIFICATION_GRACE_MS = 2 * 60 * 1000;

function withTime(date: Date, hours: number, minutes: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

export function getScheduleNotificationTime(schedule: ScheduleData, timing: ScheduleNotificationTiming): Date | null {
  const startAt = schedule.startAt?.toDate();
  if (!startAt) return null;
  if (timing === 'custom') return schedule.notification?.customAt?.toDate() ?? null;

  if (schedule.allDay !== false) {
    const startDay = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate());
    if (timing === 'previousDayEvening') {
      const previousDay = new Date(startDay);
      previousDay.setDate(previousDay.getDate() - 1);
      return withTime(previousDay, 17, 0);
    }
    return withTime(startDay, 8, 30);
  }

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
