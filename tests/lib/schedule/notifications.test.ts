import { describe, expect, test } from 'vitest';
import { SCHEDULE_NOTIFICATION_TIMINGS } from '../../../src/constants/schedule';
import {
  getScheduleNotificationTime as getServerScheduleNotificationTime,
  resolveScheduleRecipientIds,
} from '../../../functions/src/scheduleTime';
import type { ScheduleEvent } from '../../../src/types/schedule';
import {
  formatScheduleNotificationBody,
  formatScheduleNotificationDateTime,
  getScheduleNotificationTime,
  resolveScheduleNotificationCustomAt,
} from '../../../src/utils/scheduleNotifications';

function d(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

function event(customAt: Date | null): ScheduleEvent {
  return {
    id: 'schedule-1',
    title: 'テスト',
    categoryId: 'other',
    targetUserIds: ['u1'],
    targetUserNames: ['ユーザー1'],
    startAt: d(2026, 8, 5, 10, 0),
    endAt: d(2026, 8, 5, 11, 0),
    allDay: false,
    memo: '',
    notification: { enabled: true, timings: ['atStart'], customAt },
    createdBy: 'u1',
    createdByName: 'ユーザー1',
    createdAt: d(2026, 8, 1),
    updatedAt: null,
  };
}

describe('予定通知タイミング', () => {
  test('選択肢は保存時すぐを表示し、前日17時と当日8時半を表示しない', () => {
    expect(SCHEDULE_NOTIFICATION_TIMINGS).toContainEqual({ id: 'atStart', label: '保存時に通知' });
    expect(SCHEDULE_NOTIFICATION_TIMINGS.map(({ id }) => id)).not.toContain('previousDayEvening');
    expect(SCHEDULE_NOTIFICATION_TIMINGS.map(({ id }) => id)).not.toContain('sameDayMorning');
  });

  test('保存時すぐは保存時刻を customAt として使用する', () => {
    const savedAt = d(2026, 8, 1, 13, 45);
    expect(resolveScheduleNotificationCustomAt('atStart', null, savedAt)).toBe(savedAt);
    expect(getScheduleNotificationTime(event(savedAt), 'atStart')).toBe(savedAt);
    expect(getServerScheduleNotificationTime({
      startAt: { toDate: () => d(2026, 8, 5, 10, 0) } as never,
      notification: { customAt: { toDate: () => savedAt } as never },
    }, 'atStart')).toBe(savedAt);
  });

  test('旧atStartデータは開始時刻へフォールバックする', () => {
    const legacy = event(null);
    expect(getScheduleNotificationTime(legacy, 'atStart')).toBe(legacy.startAt);
  });

  test('予定名の下にカテゴリ・日時・対象メンバーを表示する本文を作る', () => {
    const schedule = event(null);
    expect(formatScheduleNotificationDateTime(schedule)).toBe('8月5日（水） 10:00〜11:00');
    expect(formatScheduleNotificationBody(schedule)).toBe(
      '🏷 カテゴリ：その他\n📅 8月5日（水） 10:00〜11:00\n👥 対象：ユーザー1',
    );
  });

  test('通知先は対象メンバーと全員を切り替えられ、旧データは対象メンバー扱いにする', () => {
    expect(resolveScheduleRecipientIds({
      targetUserIds: ['u1'],
      createdBy: 'owner',
      notification: { enabled: true, recipientScope: 'targets' },
    })).toEqual(['u1']);
    expect(resolveScheduleRecipientIds({
      targetUserIds: ['u1'],
      createdBy: 'owner',
      notification: { enabled: true, recipientScope: 'all' },
    }, ['u1', 'u2', 'u3'])).toEqual(['u1', 'u2', 'u3']);
    expect(resolveScheduleRecipientIds({
      targetUserIds: [],
      createdBy: 'owner',
      notification: { enabled: true },
    })).toEqual(['owner']);
  });
});
