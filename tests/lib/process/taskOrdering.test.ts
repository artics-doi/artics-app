import { describe, expect, it } from 'vitest';
import { taskInputToCreateData } from '../../../src/lib/process/converters';
import { appendOrderKey, firstOrderKey } from '../../../src/lib/process/order';
import { buildAppendedTaskOrderKeys } from '../../../src/lib/process/taskOrdering';
import type { TaskInput } from '../../../src/types/process';

describe('process task ordering', () => {
  it('新規タスクは列内orderとガント全体ganttOrderを別々に末尾採番する', () => {
    const first = firstOrderKey();
    const second = appendOrderKey(first);
    const keys = buildAppendedTaskOrderKeys(
      [
        { columnId: 'todo', order: first, ganttOrder: first },
        { columnId: 'done', order: first, ganttOrder: second },
      ],
      'doing',
    );

    expect(keys.order).toBe(first);
    expect(keys.ganttOrder > second).toBe(true);
    expect(keys.ganttOrder).not.toBe(keys.order);
  });

  it('同じ列への追加は列内orderも末尾にする', () => {
    const first = firstOrderKey();
    const second = appendOrderKey(first);
    const keys = buildAppendedTaskOrderKeys(
      [
        { columnId: 'doing', order: first, ganttOrder: first },
        { columnId: 'todo', order: second, ganttOrder: second },
      ],
      'doing',
    );

    expect(keys.order > first).toBe(true);
    expect(keys.ganttOrder > second).toBe(true);
  });

  it('Firestore作成データにorderとganttOrderを別値で保存できる', () => {
    const input: TaskInput = {
      title: '新しいタスク',
      columnId: 'doing',
      assigneeIds: [],
      startDate: null,
      endDate: null,
      completedDate: null,
      completionChecked: false,
      description: '',
    };

    const data = taskInputToCreateData(input, 'project-1', 'a0', 'z0', {
      createdBy: 'user-1',
      createdByName: 'User',
    });

    expect(data.order).toBe('a0');
    expect(data.ganttOrder).toBe('z0');
  });
});
