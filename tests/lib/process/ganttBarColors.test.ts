import { describe, expect, it } from 'vitest';
import {
  buildGanttInstanceKey,
  ganttStatusColorVariables,
} from '../../../src/lib/process/ganttBarColors';

describe('gantt bar colors', () => {
  it('ガント本体キーは表示順とステータス変更で変わる', () => {
    const before = buildGanttInstanceKey('day', 0, [
      { id: 'a', processStatus: 'doing', ganttOrder: 'a0' },
      { id: 'b', processStatus: 'todo', ganttOrder: 'b0' },
    ]);
    const reordered = buildGanttInstanceKey('day', 0, [
      { id: 'b', processStatus: 'todo', ganttOrder: 'a0' },
      { id: 'a', processStatus: 'doing', ganttOrder: 'b0' },
    ]);
    const statusChanged = buildGanttInstanceKey('day', 0, [
      { id: 'a', processStatus: 'todo', ganttOrder: 'a0' },
      { id: 'b', processStatus: 'todo', ganttOrder: 'b0' },
    ]);

    expect(reordered).not.toBe(before);
    expect(statusChanged).not.toBe(before);
  });

  it('ステータスからテンプレート用の色変数を返す', () => {
    expect(ganttStatusColorVariables('doing')).toEqual({
      '--artics-gantt-task-fill': '#86efac',
      '--artics-gantt-task-border': '#16a34a',
      '--artics-gantt-task-text': '#14532d',
    });
  });
});
