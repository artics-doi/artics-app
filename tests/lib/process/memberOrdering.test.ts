import { describe, expect, it } from 'vitest';
import { buildMemberReorderUpdates } from '../../../src/lib/process/memberOrdering';

describe('process member ordering', () => {
  it('ドラッグ後の表示順に合わせてorder更新を作る', () => {
    const updates = buildMemberReorderUpdates(
      [
        { id: 'a', order: 0 },
        { id: 'b', order: 1 },
        { id: 'c', order: 2 },
      ],
      'c',
      'a',
    );

    expect(updates).toEqual([
      { memberId: 'c', order: 0 },
      { memberId: 'a', order: 1 },
      { memberId: 'b', order: 2 },
    ]);
  });

  it('順番が変わらない場合は更新しない', () => {
    expect(
      buildMemberReorderUpdates(
        [
          { id: 'a', order: 0 },
          { id: 'b', order: 1 },
        ],
        'a',
        'a',
      ),
    ).toEqual([]);
  });

  it('存在しないidの場合は更新しない', () => {
    expect(
      buildMemberReorderUpdates(
        [
          { id: 'a', order: 0 },
          { id: 'b', order: 1 },
        ],
        'missing',
        'a',
      ),
    ).toEqual([]);
  });
});
