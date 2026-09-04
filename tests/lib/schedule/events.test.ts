import { describe, expect, test } from 'vitest';
import {
  buildWeekEvents,
  compareSchedules,
  copyScheduleToDate,
  eventIntersectsDay,
  eventIntersectsRange,
  formatEventTargetsTitle,
  formatEventTime,
  getEventTargetPreview,
  getDayMultiLaneCount,
  getEventDurationDays,
  getSingleDayEventsForOrder,
  isMultiDayEvent,
} from '../../../src/lib/schedule/events';
import { getWeekDays } from '../../../src/lib/schedule/calendar';
import type { ScheduleEvent } from '../../../src/types/schedule';

function d(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

function event(partial: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    id: 'e1',
    title: '予定',
    categoryId: 'vacation',
    targetUserIds: ['u1'],
    targetUserNames: ['ユーザー1'],
    startAt: d(2026, 6, 10),
    endAt: null,
    allDay: true,
    memo: '',
    notification: { enabled: false, timings: [], customAt: null },
    createdBy: 'u1',
    createdByName: 'ユーザー1',
    createdAt: d(2026, 6, 1),
    updatedAt: null,
    ...partial,
  };
}

describe('期間判定', () => {
  test('endAt なしは1日扱い', () => {
    expect(getEventDurationDays(event())).toBe(1);
    expect(isMultiDayEvent(event())).toBe(false);
  });

  test('日をまたぐと複数日', () => {
    const e = event({ startAt: d(2026, 6, 10, 22), endAt: d(2026, 6, 11, 1) });
    expect(getEventDurationDays(e)).toBe(2);
    expect(isMultiDayEvent(e)).toBe(true);
  });

  test('eventIntersectsDay / Range は日の端を含む', () => {
    const e = event({ startAt: d(2026, 6, 10, 9), endAt: d(2026, 6, 12, 18), allDay: false });
    expect(eventIntersectsDay(e, d(2026, 6, 10))).toBe(true);
    expect(eventIntersectsDay(e, d(2026, 6, 12))).toBe(true);
    expect(eventIntersectsDay(e, d(2026, 6, 13))).toBe(false);
    expect(eventIntersectsRange(e, d(2026, 6, 12), d(2026, 6, 14))).toBe(true);
    expect(eventIntersectsRange(e, d(2026, 6, 13), d(2026, 6, 14))).toBe(false);
  });
});

describe('formatEventTime', () => {
  test('終日単日は「終日」、終日複数日は日付範囲', () => {
    expect(formatEventTime(event())).toBe('終日');
    expect(formatEventTime(event({ endAt: d(2026, 6, 12) }))).toBe('6/10 ～ 6/12');
    expect(formatEventTime(event({ startAt: d(2026, 12, 31), endAt: d(2027, 1, 1) }))).toBe(
      '2026/12/31 ～ 2027/1/1',
    );
  });

  test('時刻指定は開始日を明示し、日またぎは両側の日付を表示する', () => {
    expect(formatEventTime(event({ allDay: false, startAt: d(2026, 6, 10, 9), endAt: d(2026, 6, 10, 12) }))).toBe(
      '6/10 09:00 ～ 12:00',
    );
    expect(formatEventTime(event({ allDay: false, startAt: d(2026, 6, 10, 22), endAt: d(2026, 6, 11, 1) }))).toBe(
      '6/10 22:00 ～ 6/11 01:00',
    );
    expect(formatEventTime(event({ allDay: false, startAt: d(2026, 12, 31, 22), endAt: d(2027, 1, 1, 13) }))).toBe(
      '2026/12/31 22:00 ～ 2027/1/1 13:00',
    );
    expect(formatEventTime(event({ allDay: false, startAt: d(2026, 6, 10, 9) }))).toBe('09:00');
  });
});

describe('getEventTargetPreview', () => {
  test('対象者は先頭2人と残り人数に分ける', () => {
    expect(getEventTargetPreview([])).toEqual({ visibleNames: [], remainingCount: 0 });
    expect(getEventTargetPreview(['岡谷', '安井'])).toEqual({
      visibleNames: ['岡谷', '安井'],
      remainingCount: 0,
    });
    expect(getEventTargetPreview(['岡谷', '安井', '村尾', '木本'])).toEqual({
      visibleNames: ['岡谷', '安井'],
      remainingCount: 2,
    });
  });

  test('ツールチップ用は全員を表示し、空の名前は除外する', () => {
    expect(formatEventTargetsTitle([' 岡谷 ', '', '安井'])).toBe('対象：岡谷、安井');
    expect(formatEventTargetsTitle(['  '])).toBe('対象：未設定');
  });
});

describe('compareSchedules', () => {
  test('複数日イベントが単日より先', () => {
    const multi = event({ id: 'multi', startAt: d(2026, 6, 10), endAt: d(2026, 6, 12) });
    const single = event({ id: 'single', startAt: d(2026, 6, 9) });
    expect(compareSchedules(multi, single)).toBeLessThan(0);
    expect(compareSchedules(single, multi)).toBeGreaterThan(0);
  });

  test('期間が長い方が先', () => {
    const long = event({ id: 'long', startAt: d(2026, 6, 10), endAt: d(2026, 6, 14) });
    const short = event({ id: 'short', startAt: d(2026, 6, 10), endAt: d(2026, 6, 11) });
    expect(compareSchedules(long, short)).toBeLessThan(0);
  });

  test('同日の手動並び順（manualOrder）が優先される', () => {
    const a = event({ id: 'a', manualOrderDate: '2026-06-10', manualOrder: 2 });
    const b = event({ id: 'b', manualOrderDate: '2026-06-10', manualOrder: 1 });
    expect(compareSchedules(a, b)).toBeGreaterThan(0);
    // 手動順を持つ方が持たない方より先
    const c = event({ id: 'c' });
    expect(compareSchedules(b, c)).toBeLessThan(0);
  });

  test('終日が時刻指定より先、開始が早い方が先', () => {
    const allDay = event({ id: 'allday' });
    const timed = event({ id: 'timed', allDay: false, startAt: d(2026, 6, 10, 9) });
    expect(compareSchedules(allDay, timed)).toBeLessThan(0);

    const early = event({ id: 'early', allDay: false, startAt: d(2026, 6, 10, 9) });
    const late = event({ id: 'late', allDay: false, startAt: d(2026, 6, 10, 10) });
    expect(compareSchedules(early, late)).toBeLessThan(0);
  });

  test('カテゴリ優先度（holiday が vacation より先）→ タイトル → id の順で決着', () => {
    const holiday = event({ id: 'h', categoryId: 'holiday' });
    const vacation = event({ id: 'v', categoryId: 'vacation' });
    expect(compareSchedules(holiday, vacation)).toBeLessThan(0);

    const titleA = event({ id: 'x', title: 'あ' });
    const titleB = event({ id: 'y', title: 'い' });
    expect(compareSchedules(titleA, titleB)).toBeLessThan(0);

    const sameAll = event({ id: 'a' });
    const sameAll2 = event({ id: 'b' });
    expect(compareSchedules(sameAll, sameAll2)).toBeLessThan(0);
  });
});

describe('buildWeekEvents / レーン配置', () => {
  // 2026-06-08(月)〜06-14(日) の週
  const week = getWeekDays(d(2026, 6, 11));

  test('重なるイベントは別レーン、空いたレーンを再利用', () => {
    const e1 = event({ id: 'e1', startAt: d(2026, 6, 8), endAt: d(2026, 6, 10) }); // 月-水
    const e2 = event({ id: 'e2', startAt: d(2026, 6, 9), endAt: d(2026, 6, 11) }); // 火-木
    const e3 = event({ id: 'e3', startAt: d(2026, 6, 12), endAt: d(2026, 6, 13) }); // 金-土
    const result = buildWeekEvents([e1, e2, e3], week);

    const byId = new Map(result.map((r) => [r.event.id, r]));
    expect(byId.get('e1')).toMatchObject({ startColumn: 1, endColumn: 3, lane: 0 });
    expect(byId.get('e2')).toMatchObject({ startColumn: 2, endColumn: 4, lane: 1 });
    // e3 は e1 のレーンが空くので lane 0 を再利用
    expect(byId.get('e3')).toMatchObject({ startColumn: 5, endColumn: 6, lane: 0 });
  });

  test('週をはみ出すイベントは1〜7列にクランプされる', () => {
    const e = event({ id: 'span', startAt: d(2026, 6, 5), endAt: d(2026, 6, 20) });
    const result = buildWeekEvents([e], week);
    expect(result[0]).toMatchObject({ startColumn: 1, endColumn: 7 });
  });

  test('週に重ならないイベントは除外される', () => {
    const e = event({ id: 'out', startAt: d(2026, 6, 20), endAt: d(2026, 6, 21) });
    expect(buildWeekEvents([e], week)).toHaveLength(0);
  });

  test('getDayMultiLaneCount は当日に重なる最大レーン+1', () => {
    const e1 = event({ id: 'e1', startAt: d(2026, 6, 8), endAt: d(2026, 6, 10) });
    const e2 = event({ id: 'e2', startAt: d(2026, 6, 9), endAt: d(2026, 6, 11) });
    const weekEvents = buildWeekEvents([e1, e2], week);
    expect(getDayMultiLaneCount(weekEvents, 1)).toBe(2); // 火曜: 両方
    expect(getDayMultiLaneCount(weekEvents, 3)).toBe(2); // 木曜: e2 のみだが lane 1 → 2
    expect(getDayMultiLaneCount(weekEvents, 5)).toBe(0); // 土曜: なし
  });
});

describe('getSingleDayEventsForOrder', () => {
  test('指定日の単日イベントのみをソートして返す', () => {
    const single1 = event({ id: 's1', allDay: false, startAt: d(2026, 6, 10, 10) });
    const single2 = event({ id: 's2', allDay: false, startAt: d(2026, 6, 10, 9) });
    const multi = event({ id: 'm', startAt: d(2026, 6, 10), endAt: d(2026, 6, 11) });
    const other = event({ id: 'o', startAt: d(2026, 6, 11) });
    const result = getSingleDayEventsForOrder([single1, single2, multi, other], '2026-06-10');
    expect(result.map((e) => e.id)).toEqual(['s2', 's1']);
  });
});

describe('copyScheduleToDate', () => {
  test('時刻指定イベントは時刻を維持して対象日に複製', () => {
    const source = event({
      allDay: false,
      startAt: d(2026, 6, 10, 9, 30),
      endAt: d(2026, 6, 10, 12, 0),
    });
    const input = copyScheduleToDate(source, d(2026, 6, 20));
    expect(input.startAt).toEqual(d(2026, 6, 20, 9, 30));
    expect(input.endAt).toEqual(d(2026, 6, 20, 12, 0));
    expect(input.allDay).toBe(false);
  });

  test('終日複数日イベントは日数を維持して複製', () => {
    const source = event({ startAt: d(2026, 6, 10), endAt: new Date(2026, 5, 12, 23, 59, 59, 999) });
    const input = copyScheduleToDate(source, d(2026, 6, 20));
    expect(input.startAt).toEqual(d(2026, 6, 20));
    expect(input.endAt).toEqual(new Date(2026, 5, 22, 23, 59, 59, 999));
  });

  test('通知が無効なら timings は空・customAt は null', () => {
    const source = event({
      notification: { enabled: false, timings: ['sameDayMorning'], customAt: d(2026, 6, 9, 8, 30) },
    });
    const input = copyScheduleToDate(source, d(2026, 6, 20));
    expect(input.notification).toEqual({ enabled: false, recipientScope: 'targets', timings: [], customAt: null });
  });

  test('カスタム通知は開始日との日数差を維持してシフト', () => {
    const source = event({
      startAt: d(2026, 6, 10),
      notification: { enabled: true, timings: ['custom'], customAt: d(2026, 6, 12, 8, 30) },
    });
    const input = copyScheduleToDate(source, d(2026, 6, 20));
    expect(input.notification.customAt).toEqual(d(2026, 6, 22, 8, 30));
  });

  test('予定保存時すぐの通知はコピー保存時刻へ更新する', () => {
    const savedAt = d(2026, 6, 15, 14, 20);
    const source = event({
      notification: { enabled: true, timings: ['atStart'], customAt: d(2026, 6, 10, 9, 0) },
    });
    const input = copyScheduleToDate(source, d(2026, 6, 20), savedAt);
    expect(input.notification.customAt).toEqual(savedAt);
  });
});
