import { nextOrderKeyForList } from './order';

type TaskOrderSource = {
  columnId: string;
  order: string;
  ganttOrder: string;
};

export function buildAppendedTaskOrderKeys(
  tasks: readonly TaskOrderSource[],
  columnId: string,
): { order: string; ganttOrder: string } {
  const sameColumnOrders = tasks.filter((task) => task.columnId === columnId).map((task) => task.order);
  const ganttOrders = tasks.map((task) => task.ganttOrder || task.order);

  return {
    order: nextOrderKeyForList(sameColumnOrders),
    ganttOrder: nextOrderKeyForList(ganttOrders),
  };
}
