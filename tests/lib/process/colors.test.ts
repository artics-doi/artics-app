import { describe, expect, test } from 'vitest';
import { accentOf } from '../../../src/lib/process/colors';
import { PROCESS_COLORS, PROCESS_COLOR_COUNT } from '../../../src/constants/process';

describe('accentOf', () => {
  test('インデックスに対応するアクセントカラーを返す', () => {
    expect(accentOf(0)).toBe(PROCESS_COLORS[0].accent);
    expect(accentOf(PROCESS_COLOR_COUNT - 1)).toBe(PROCESS_COLORS[PROCESS_COLOR_COUNT - 1].accent);
  });

  test('範囲外のインデックスはラップする', () => {
    expect(accentOf(PROCESS_COLOR_COUNT)).toBe(PROCESS_COLORS[0].accent);
    expect(accentOf(PROCESS_COLOR_COUNT + 2)).toBe(PROCESS_COLORS[2].accent);
  });

  test('負のインデックスもラップする', () => {
    expect(accentOf(-1)).toBe(PROCESS_COLORS[PROCESS_COLOR_COUNT - 1].accent);
  });
});
