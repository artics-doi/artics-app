// スマホ向け予定表（ドットカレンダー / アジェンダ）の純ロジック。
// React 非依存。テストは tests/lib/schedule/mobileAgenda.test.ts。

import { SCHEDULE_CATEGORY_BY_ID } from '../../constants/schedule';
import type { ScheduleEvent } from '../../types/schedule';
import { compareSchedules, eventIntersectsDay } from './events';

export type MonthDayDots = {
  /** 表示するカテゴリ tone（最大 maxDots 件、compareSchedules 順） */
  tones: string[];
  /** ドットに載せきれない件数 */
  overflow: number;
};

export type AgendaSection = {
  day: Date;
  events: ScheduleEvent[];
};

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/**
 * その日にかかる予定から、カテゴリ tone の配列とあふれ件数を返す。
 * 並びは compareSchedules。maxDots の既定は 3。
 */
export function buildMonthDayDots(
  events: readonly ScheduleEvent[],
  day: Date,
  maxDots = 3,
): MonthDayDots {
  const limit = Math.max(0, maxDots);
  const dayEvents = events
    .filter((event) => eventIntersectsDay(event, day))
    .sort(compareSchedules);

  const tones = dayEvents.slice(0, limit).map((event) => (
    SCHEDULE_CATEGORY_BY_ID[event.categoryId]?.tone ?? 'slate'
  ));
  const overflow = Math.max(0, dayEvents.length - limit);
  return { tones, overflow };
}

/**
 * 日付配列から { day, events } のセクション配列を返す。
 * 各日の予定は eventIntersectsDay で抽出し compareSchedules で並べる。
 */
export function buildAgendaSections(
  events: readonly ScheduleEvent[],
  days: readonly Date[],
): AgendaSection[] {
  return days.map((day) => ({
    day,
    events: events
      .filter((event) => eventIntersectsDay(event, day))
      .sort(compareSchedules),
  }));
}

/** `6月30日（火）` 形式の見出しラベル。 */
export function formatAgendaDayLabel(day: Date): string {
  return `${day.getMonth() + 1}月${day.getDate()}日（${WEEKDAY_JA[day.getDay()]}）`;
}
