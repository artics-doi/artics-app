import { describe, expect, test } from 'vitest';
import {
  filterSchedulesByCategories,
} from '../../../src/lib/schedule/filters';
import type { ScheduleEvent, ScheduleCategoryId } from '../../../src/types/schedule';

function d(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

function event(id: string, categoryId: ScheduleCategoryId, partial: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    id,
    title: id,
    categoryId,
    targetUserIds: [],
    targetUserNames: [],
    startAt: d(2026, 6, 11, 9),
    endAt: d(2026, 6, 11, 10),
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

describe('filterSchedulesByCategories', () => {
  test('カテゴリ未選択なら全件を返す', () => {
    const schedules = [event('a', 'vacation'), event('b', 'vehicle')];
    expect(filterSchedulesByCategories(schedules, [])).toHaveLength(2);
  });

  test('選択カテゴリだけを抽出する', () => {
    const schedules = [event('a', 'vacation'), event('b', 'vehicle'), event('c', 'largeMeetingRoom')];
    expect(filterSchedulesByCategories(schedules, ['vehicle', 'largeMeetingRoom']).map((item) => item.id)).toEqual(['b', 'c']);
  });
});
