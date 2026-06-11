import { describe, expect, test } from 'vitest';
import { resolveMenuPosition } from '../../../src/lib/chat/menuPosition';

const INNER_WIDTH = 1000;

describe('resolveMenuPosition', () => {
  test('画面上端付近（top < 150）はメニューを下に出す', () => {
    expect(resolveMenuPosition({ top: 149, right: 100 }, INNER_WIDTH)).toEqual({
      vertical: 'below',
      horizontal: 'left',
    });
  });

  test('それ以外は上に出す（境界値 150 ちょうどは above）', () => {
    expect(resolveMenuPosition({ top: 150, right: 100 }, INNER_WIDTH).vertical).toBe('above');
    expect(resolveMenuPosition({ top: 500, right: 100 }, INNER_WIDTH).vertical).toBe('above');
  });

  test('画面右端付近（right > innerWidth - 200）は右寄せ', () => {
    expect(resolveMenuPosition({ top: 500, right: 801 }, INNER_WIDTH).horizontal).toBe('right');
    // 境界値ちょうど（right === innerWidth - 200）は左寄せのまま
    expect(resolveMenuPosition({ top: 500, right: 800 }, INNER_WIDTH).horizontal).toBe('left');
  });
});
