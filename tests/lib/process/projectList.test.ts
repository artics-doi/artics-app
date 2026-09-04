import { describe, expect, test } from 'vitest';
import {
  buildProjectTaskSummaries,
  filterProjectsByQuery,
  projectMatchesSearch,
} from '../../../src/lib/process/projectList';
import type { Project, Task } from '../../../src/types/process';

function makeProject(partial: Partial<Project>): Project {
  return {
    id: 'p1',
    name: 'プロジェクト',
    description: '',
    colorIndex: 0,
    status: 'active',
    columns: [
      { id: 'todo', name: '未着手', order: 0 },
      { id: 'doing', name: '進行中', order: 1 },
      { id: 'done', name: '完了', order: 2 },
      { id: 'hold', name: '保留', order: 3 },
    ],
    order: 'a0',
    createdBy: 'u',
    createdByName: 'U',
    createdAt: null,
    updatedAt: null,
    ...partial,
  };
}

function makeTask(partial: Partial<Task>): Task {
  return {
    id: 't1',
    title: 'タスク',
    projectId: 'p1',
    columnId: 'todo',
    assigneeIds: [],
    startDate: null,
    endDate: null,
    completedDate: null,
    completionChecked: false,
    description: '',
    order: 'a0',
    ganttOrder: 'a0',
    archived: false,
    isArchived: false,
    createdBy: 'u',
    createdByName: 'U',
    createdAt: null,
    updatedAt: null,
    ...partial,
  };
}

describe('buildProjectTaskSummaries', () => {
  test('プロジェクトごとに4ステータスを集計する', () => {
    const projects = [makeProject({ id: 'p1' }), makeProject({ id: 'p2' })];
    const summaries = buildProjectTaskSummaries(projects, [
      makeTask({ id: 't1', projectId: 'p1', columnId: 'todo' }),
      makeTask({ id: 't2', projectId: 'p1', columnId: 'doing' }),
      makeTask({ id: 't3', projectId: 'p1', columnId: 'done' }),
      makeTask({ id: 't4', projectId: 'p1', columnId: 'hold' }),
      makeTask({ id: 't5', projectId: 'p2', columnId: 'doing' }),
    ]);

    expect(summaries.get('p1')).toEqual({ todo: 1, doing: 1, done: 1, hold: 1, total: 4 });
    expect(summaries.get('p2')).toEqual({ todo: 0, doing: 1, done: 0, hold: 0, total: 1 });
  });

  test('タスクがないプロジェクトは0件で初期化する', () => {
    const summaries = buildProjectTaskSummaries([makeProject({ id: 'p1' })], []);
    expect(summaries.get('p1')).toEqual({ todo: 0, doing: 0, done: 0, hold: 0, total: 0 });
  });

  test('個別アーカイブ済みタスクは件数に含めない', () => {
    const summaries = buildProjectTaskSummaries([makeProject({ id: 'p1' })], [
      makeTask({ id: 'active' }),
      makeTask({ id: 'archived', isArchived: true }),
    ]);
    expect(summaries.get('p1')?.total).toBe(1);
  });

  test('列名ベースの補助判定も使う', () => {
    const project = makeProject({
      columns: [
        { id: 'custom1', name: '対応中', order: 0 },
        { id: 'custom2', name: '完了確認', order: 1 },
      ],
    });
    const summaries = buildProjectTaskSummaries([project], [
      makeTask({ id: 't1', columnId: 'custom1' }),
      makeTask({ id: 't2', columnId: 'custom2' }),
    ]);

    expect(summaries.get('p1')).toEqual({ todo: 0, doing: 1, done: 1, hold: 0, total: 2 });
  });
});

describe('project search', () => {
  const project = makeProject({
    name: 'ICV4400 試作',
    description: '担当: 山田\nレビュー対象',
  });

  test('プロジェクト名と説明を検索する', () => {
    expect(projectMatchesSearch(project, 'ICV4400')).toBe(true);
    expect(projectMatchesSearch(project, '山田')).toBe(true);
    expect(projectMatchesSearch(project, 'not-found')).toBe(false);
  });

  test('一覧を検索条件で絞り込む', () => {
    const projects = [
      project,
      makeProject({ id: 'p2', name: '別案件', description: '量産準備' }),
    ];
    expect(filterProjectsByQuery(projects, '量産').map((item) => item.id)).toEqual(['p2']);
  });
});
