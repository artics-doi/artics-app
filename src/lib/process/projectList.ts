import type { Project, Task } from '../../types/process';
import { taskStatusFromColumn, type ProcessGanttTask } from './gantt';

export type ProjectTaskStatus = ProcessGanttTask['processStatus'];

export type ProjectTaskSummary = Record<ProjectTaskStatus, number> & {
  total: number;
};

export const EMPTY_PROJECT_TASK_SUMMARY: ProjectTaskSummary = {
  todo: 0,
  doing: 0,
  done: 0,
  hold: 0,
  total: 0,
};

export const PROJECT_TASK_STATUS_LABELS: Array<{
  id: ProjectTaskStatus;
  label: string;
}> = [
  { id: 'todo', label: '未着手' },
  { id: 'doing', label: '進行中' },
  { id: 'done', label: '完了' },
  { id: 'hold', label: '保留' },
];

function emptySummary(): ProjectTaskSummary {
  return { ...EMPTY_PROJECT_TASK_SUMMARY };
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase('ja-JP');
}

export function projectMatchesSearch(project: Project, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return [project.name, project.description]
    .map((value) => normalizeSearchText(value))
    .some((value) => value.includes(normalizedQuery));
}

export function filterProjectsByQuery(projects: readonly Project[], query: string): Project[] {
  return projects.filter((project) => projectMatchesSearch(project, query));
}

export function buildProjectTaskSummaries(
  projects: readonly Project[],
  tasks: readonly Task[],
): Map<string, ProjectTaskSummary> {
  const summaries = new Map<string, ProjectTaskSummary>();
  const projectById = new Map(projects.map((project) => [project.id, project]));

  for (const project of projects) {
    summaries.set(project.id, emptySummary());
  }

  for (const task of tasks) {
    if (task.isArchived) continue;
    const project = projectById.get(task.projectId);
    if (!project) continue;
    const summary = summaries.get(project.id) ?? emptySummary();
    const column = project.columns.find((candidate) => candidate.id === task.columnId) ?? {
      id: task.columnId,
      name: '',
    };
    const status = taskStatusFromColumn(column);
    summary[status] += 1;
    summary.total += 1;
    summaries.set(project.id, summary);
  }

  return summaries;
}
