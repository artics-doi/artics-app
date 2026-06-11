import type { ProcessGanttTask } from './gantt';

export const GANTT_STATUS_COLORS: Record<
  ProcessGanttTask['processStatus'],
  { fill: string; border: string; text: string }
> = {
  todo: { fill: '#cbd5e1', border: '#64748b', text: '#1e293b' },
  doing: { fill: '#86efac', border: '#16a34a', text: '#14532d' },
  done: { fill: '#93c5fd', border: '#2563eb', text: '#1e3a8a' },
  hold: { fill: '#fde68a', border: '#d97706', text: '#78350f' },
};

export function buildGanttInstanceKey(
  viewMode: string,
  layoutVersion: number,
  tasks: readonly Pick<ProcessGanttTask, 'id' | 'processStatus' | 'ganttOrder'>[],
): string {
  return [
    viewMode,
    layoutVersion,
    tasks.map((task) => `${task.id}:${task.processStatus}:${task.ganttOrder}`).join('|'),
  ].join('__');
}

export function ganttStatusColorVariables(
  status: ProcessGanttTask['processStatus'],
): Record<string, string> {
  const color = GANTT_STATUS_COLORS[status];
  return {
    '--artics-gantt-task-fill': color.fill,
    '--artics-gantt-task-border': color.border,
    '--artics-gantt-task-text': color.text,
  };
}
