import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { formatDateLabel, formatTimeSmart } from '../../../src/utils/dateUtils';

// 特性テスト: 現在時刻を 2026-06-11 12:00 に固定して現挙動を記録する
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 11, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('formatDateLabel', () => {
  test('undefined は空文字を返す', () => {
    expect(formatDateLabel(undefined)).toBe('');
  });

  test('当日は「今日」を返す', () => {
    expect(formatDateLabel(new Date(2026, 5, 11, 0, 0, 0))).toBe('今日');
    expect(formatDateLabel(new Date(2026, 5, 11, 23, 59, 59))).toBe('今日');
  });

  test('前日は「昨日」を返す', () => {
    expect(formatDateLabel(new Date(2026, 5, 10, 23, 59, 59))).toBe('昨日');
  });

  test('同年のそれ以前は「M月D日」を返す', () => {
    expect(formatDateLabel(new Date(2026, 0, 5))).toBe('1月5日');
    expect(formatDateLabel(new Date(2026, 5, 9))).toBe('6月9日');
  });

  test('別年は「YYYY年M月D日」を返す', () => {
    expect(formatDateLabel(new Date(2025, 11, 31))).toBe('2025年12月31日');
  });
});

describe('formatTimeSmart', () => {
  test('undefined は空文字を返す', () => {
    expect(formatTimeSmart(undefined)).toBe('');
  });

  test('当日は HH:mm のみ（0埋め）', () => {
    expect(formatTimeSmart(new Date(2026, 5, 11, 9, 5))).toBe('09:05');
  });

  test('同年の別日は「M月D日 HH:mm」', () => {
    expect(formatTimeSmart(new Date(2026, 2, 7, 8, 30))).toBe('3月7日 08:30');
  });

  test('別年は「YYYY/M/D HH:mm」', () => {
    expect(formatTimeSmart(new Date(2025, 10, 2, 23, 59))).toBe('2025/11/2 23:59');
  });
});
