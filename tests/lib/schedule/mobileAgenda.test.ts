import { describe, expect, test } from 'vitest';
import {
  buildAgendaSections,
  buildMonthDayDots,
  formatAgendaDayLabel,
} from '../../../src/lib/schedule/mobileAgenda';
import type { ScheduleEvent, ScheduleCategoryId } from '../../../src/types/schedule';

function d(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

function event(
  id: string,
  categoryId: ScheduleCategoryId,
  partial: Partial<ScheduleEvent> = {},
): ScheduleEvent {
  return {
    id,
    title: id,
    categoryId,
    targetUserIds: [],
    targetUserNames: [],
    startAt: d(2026, 6, 10, 9),
    endAt: d(2026, 6, 10, 10),
    allDay: false,
    memo: '',
    notification: { enabled: false, timings: [], customAt: null },
    createdBy: 'u1',
    createdByName: 'user',
    createdAt: d(2026, 6, 1),
    updatedAt: null,
    ...partial,
  };
}

describe('buildMonthDayDots', () => {
  test('その日にかかる予定だけを対象にし tone を返す', () => {
    const events = [
      event('a', 'vacation', { startAt: d(2026, 6, 10), endAt: null, allDay: true }),
      event('b', 'outing', { startAt: d(2026, 6, 11), endAt: null, allDay: true }),
    ];
    const result = buildMonthDayDots(events, d(2026, 6, 10));
    expect(result.tones).toEqual(['green']);
    expect(result.overflow).toBe(0);
  });

  test('複数日予定はその期間の全日に含まれる', () => {
    const events = [
      event('trip', 'businessTrip', {
        startAt: d(2026, 6, 9),
        endAt: d(2026, 6, 11),
        allDay: true,
      }),
    ];
    expect(buildMonthDayDots(events, d(2026, 6, 10)).tones).toEqual(['yellow']);
    expect(buildMonthDayDots(events, d(2026, 6, 12)).tones).toEqual([]);
  });

  test('maxDots を超えた分は overflow に載る（既定3）', () => {
    const events = [
      event('1', 'holiday', { startAt: d(2026, 6, 10), endAt: null, allDay: true }),
      event('2', 'outing', { startAt: d(2026, 6, 10, 9), endAt: d(2026, 6, 10, 10), allDay: false }),
      event('3', 'fieldwork', { startAt: d(2026, 6, 10, 11), endAt: d(2026, 6, 10, 12), allDay: false }),
      event('4', 'vehicle', { startAt: d(2026, 6, 10, 13), endAt: d(2026, 6, 10, 14), allDay: false }),
    ];
    const result = buildMonthDayDots(events, d(2026, 6, 10));
    expect(result.tones).toHaveLength(3);
    expect(result.overflow).toBe(1);
  });

  test('maxDots を明示指定できる', () => {
    const events = [
      event('1', 'holiday', { startAt: d(2026, 6, 10), endAt: null, allDay: true }),
      event('2', 'outing', { startAt: d(2026, 6, 10, 9), endAt: d(2026, 6, 10, 10), allDay: false }),
    ];
    const result = buildMonthDayDots(events, d(2026, 6, 10), 1);
    expect(result.tones).toHaveLength(1);
    expect(result.overflow).toBe(1);
  });

  test('compareSchedules 順（複数日・終日が先）で tone を並べる', () => {
    // holiday は CATEGORY_SORT で最優先寄りだが、まず multi-day / allDay が優先
    const multi = event('multi', 'other', {
      startAt: d(2026, 6, 9),
      endAt: d(2026, 6, 11),
      allDay: true,
    });
    const singleTimed = event('timed', 'holiday', {
      startAt: d(2026, 6, 10, 9),
      endAt: d(2026, 6, 10, 10),
      allDay: false,
    });
    const result = buildMonthDayDots([singleTimed, multi], d(2026, 6, 10));
    expect(result.tones[0]).toBe('slate'); // multi / other
    expect(result.tones[1]).toBe('red'); // holiday
  });

  test('予定なしは空配列と overflow 0', () => {
    expect(buildMonthDayDots([], d(2026, 6, 10))).toEqual({ tones: [], overflow: 0 });
  });
});

describe('buildAgendaSections', () => {
  test('各日の予定を抽出し compareSchedules で並べる', () => {
    const events = [
      event('b', 'outing', {
        startAt: d(2026, 6, 10, 14),
        endAt: d(2026, 6, 10, 15),
        allDay: false,
      }),
      event('a', 'vacation', {
        startAt: d(2026, 6, 10),
        endAt: null,
        allDay: true,
      }),
      event('c', 'vehicle', {
        startAt: d(2026, 6, 11, 9),
        endAt: d(2026, 6, 11, 10),
        allDay: false,
      }),
    ];
    const days = [d(2026, 6, 10), d(2026, 6, 11), d(2026, 6, 12)];
    const sections = buildAgendaSections(events, days);

    expect(sections).toHaveLength(3);
    expect(sections[0].events.map((e) => e.id)).toEqual(['a', 'b']);
    expect(sections[1].events.map((e) => e.id)).toEqual(['c']);
    expect(sections[2].events).toEqual([]);
  });

  test('複数日予定は交差する全日に現れる', () => {
    const events = [
      event('trip', 'businessTrip', {
        startAt: d(2026, 6, 10),
        endAt: d(2026, 6, 12),
        allDay: true,
      }),
    ];
    const sections = buildAgendaSections(events, [d(2026, 6, 10), d(2026, 6, 11), d(2026, 6, 13)]);
    expect(sections[0].events).toHaveLength(1);
    expect(sections[1].events).toHaveLength(1);
    expect(sections[2].events).toHaveLength(0);
  });

  test('空の日付配列なら空配列', () => {
    expect(buildAgendaSections([event('a', 'other')], [])).toEqual([]);
  });
});

describe('formatAgendaDayLabel', () => {
  test('月日と曜日を日本語で返す', () => {
    // 2026-06-30 は火曜日
    expect(formatAgendaDayLabel(d(2026, 6, 30))).toBe('6月30日（火）');
    // 2026-07-02 は木曜日
    expect(formatAgendaDayLabel(d(2026, 7, 2))).toBe('7月2日（木）');
  });
});
