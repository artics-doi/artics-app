import { describe, expect, test } from 'vitest';
import {
  addDays,
  buildDate,
  endOfDay,
  formatDayLabel,
  formatFullDayLabel,
  formatMonthLabel,
  formatScheduleDateRangeLabel,
  getCalendarDayDiff,
  getCalendarWeeks,
  getMonthCalendarDays,
  getWeekDays,
  isSameDay,
  isValidDate,
  pad2,
  shiftDateByDayDiff,
  startOfDay,
  toDateInputValue,
  toOrderDateKey,
  toTimeInputValue,
} from '../../../src/lib/schedule/calendar';

function d(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

describe('基本フォーマット', () => {
  test('pad2 は2桁0埋め', () => {
    expect(pad2(5)).toBe('05');
    expect(pad2(12)).toBe('12');
  });

  test('toDateInputValue は YYYY-MM-DD', () => {
    expect(toDateInputValue(d(2026, 6, 3))).toBe('2026-06-03');
  });

  test('toTimeInputValue は HH:mm', () => {
    expect(toTimeInputValue(d(2026, 6, 3, 9, 5))).toBe('09:05');
  });

  test('toOrderDateKey は時刻を切り捨てた日付キー', () => {
    expect(toOrderDateKey(d(2026, 6, 3, 23, 59))).toBe('2026-06-03');
  });

  test('表示ラベル各種', () => {
    expect(formatMonthLabel(d(2026, 6, 1))).toBe('2026年6月');
    expect(formatDayLabel(d(2026, 6, 3))).toBe('6月3日');
    expect(formatFullDayLabel(d(2026, 6, 3))).toBe('2026/6/3');
    expect(formatScheduleDateRangeLabel(d(2026, 6, 3), null)).toBe('2026/6/3');
    expect(formatScheduleDateRangeLabel(d(2026, 6, 3), d(2026, 6, 3, 23))).toBe('2026/6/3');
    expect(formatScheduleDateRangeLabel(d(2026, 6, 3), d(2026, 6, 5))).toBe('2026/6/3 - 2026/6/5');
  });
});

describe('日付演算', () => {
  test('startOfDay / endOfDay', () => {
    expect(startOfDay(d(2026, 6, 3, 15, 30))).toEqual(d(2026, 6, 3));
    expect(endOfDay(d(2026, 6, 3, 15, 30))).toEqual(new Date(2026, 5, 3, 23, 59, 59, 999));
  });

  test('isSameDay は年月日のみ比較', () => {
    expect(isSameDay(d(2026, 6, 3, 1), d(2026, 6, 3, 23))).toBe(true);
    expect(isSameDay(d(2026, 6, 3), d(2026, 6, 4))).toBe(false);
  });

  test('addDays は月またぎも正しい', () => {
    expect(addDays(d(2026, 6, 30), 1)).toEqual(d(2026, 7, 1));
    expect(addDays(d(2026, 6, 1), -1)).toEqual(d(2026, 5, 31));
  });

  test('getCalendarDayDiff は日単位差（負は0に丸め）', () => {
    expect(getCalendarDayDiff(d(2026, 6, 3), d(2026, 6, 5, 23))).toBe(2);
    expect(getCalendarDayDiff(d(2026, 6, 5), d(2026, 6, 3))).toBe(0);
  });
});

describe('カレンダーグリッド', () => {
  test('getMonthCalendarDays は月曜始まり42日分', () => {
    // 2026年6月1日は月曜 → グリッド先頭がちょうど6/1
    const june = getMonthCalendarDays(d(2026, 6, 15));
    expect(june).toHaveLength(42);
    expect(june[0]).toEqual(d(2026, 6, 1));
    expect(june[41]).toEqual(d(2026, 7, 12));

    // 2026年2月1日は日曜 → グリッド先頭は前月の月曜 1/26
    const feb = getMonthCalendarDays(d(2026, 2, 10));
    expect(feb[0]).toEqual(d(2026, 1, 26));
  });

  test('getWeekDays は対象日を含む月〜日の7日', () => {
    // 2026-06-11 は木曜 → 週は 6/8(月)〜6/14(日)
    const week = getWeekDays(d(2026, 6, 11));
    expect(week[0]).toEqual(d(2026, 6, 8));
    expect(week[6]).toEqual(d(2026, 6, 14));
  });

  test('getCalendarWeeks は7日ごとに分割', () => {
    const weeks = getCalendarWeeks(getMonthCalendarDays(d(2026, 6, 15)));
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toHaveLength(7);
  });
});

describe('buildDate / isValidDate', () => {
  test('終日は 00:00 開始・23:59:59.999 終了', () => {
    expect(buildDate('2026-06-03', '', true)).toEqual(d(2026, 6, 3));
    expect(buildDate('2026-06-03', '', true, true)).toEqual(new Date(2026, 5, 3, 23, 59, 59, 999));
  });

  test('時刻指定は入力時刻、未入力は開始09:00/終了18:00', () => {
    expect(buildDate('2026-06-03', '13:30', false)).toEqual(d(2026, 6, 3, 13, 30));
    expect(buildDate('2026-06-03', '', false)).toEqual(d(2026, 6, 3, 9, 0));
    expect(buildDate('2026-06-03', '', false, true)).toEqual(d(2026, 6, 3, 18, 0));
  });

  test('isValidDate は不正日付を検出', () => {
    expect(isValidDate(new Date('invalid'))).toBe(false);
    expect(isValidDate(d(2026, 6, 3))).toBe(true);
  });
});

describe('shiftDateByDayDiff', () => {
  test('終日: 開始は0時、終了は23:59:59.999', () => {
    expect(shiftDateByDayDiff(d(2026, 6, 3), d(2026, 6, 10), 2, true)).toEqual(d(2026, 6, 12));
    expect(shiftDateByDayDiff(d(2026, 6, 3), d(2026, 6, 10), 2, true, true)).toEqual(
      new Date(2026, 5, 12, 23, 59, 59, 999),
    );
  });

  test('時刻指定: 元の時刻を維持して日付だけ移動', () => {
    expect(shiftDateByDayDiff(d(2026, 6, 3, 14, 45), d(2026, 6, 10), 0, false)).toEqual(d(2026, 6, 10, 14, 45));
  });
});
