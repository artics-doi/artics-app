import { describe, expect, test } from 'vitest';
import { BADGE_MAX_COUNT, formatBadgeLabel, normalizeBadgeCount } from '../../../src/lib/electron/badge';

describe('formatBadgeLabel', () => {
  test('0 以下は null', () => {
    expect(formatBadgeLabel(0)).toBeNull();
    expect(formatBadgeLabel(-1)).toBeNull();
  });

  test('1〜99 はそのまま文字列', () => {
    expect(formatBadgeLabel(1)).toBe('1');
    expect(formatBadgeLabel(99)).toBe('99');
  });

  test('100 以上は 99+', () => {
    expect(formatBadgeLabel(100)).toBe('99+');
    expect(formatBadgeLabel(1000)).toBe('99+');
  });

  test('小数は切り捨て', () => {
    expect(formatBadgeLabel(1.7)).toBe('1');
  });

  test('非有限値は null', () => {
    expect(formatBadgeLabel(NaN)).toBeNull();
    expect(formatBadgeLabel(Infinity)).toBeNull();
  });
});

describe('normalizeBadgeCount', () => {
  test('0 以下は 0', () => {
    expect(normalizeBadgeCount(0)).toBe(0);
    expect(normalizeBadgeCount(-1)).toBe(0);
  });

  test('正の整数はそのまま', () => {
    expect(normalizeBadgeCount(1)).toBe(1);
    expect(normalizeBadgeCount(99)).toBe(99);
    expect(normalizeBadgeCount(100)).toBe(100);
    expect(normalizeBadgeCount(1000)).toBe(1000);
  });

  test('小数は切り捨て', () => {
    expect(normalizeBadgeCount(1.7)).toBe(1);
  });

  test('非有限値は 0', () => {
    expect(normalizeBadgeCount(NaN)).toBe(0);
    expect(normalizeBadgeCount(Infinity)).toBe(0);
  });
});

describe('BADGE_MAX_COUNT', () => {
  test('上限は 99', () => {
    expect(BADGE_MAX_COUNT).toBe(99);
  });
});
