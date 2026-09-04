import type { ProjectColumn, ProjectStatus } from '../types/process';

// プロジェクトの識別色（10色）。memoColors.ts と同じ light/dark ペア方式。
// colorIndex（数値）で参照する。背景に薄い色、強調にやや濃い色を想定。
export const PROCESS_COLORS = [
  { name: 'ブルー',     light: '#dbeafe', dark: '#1e3a5f', accent: '#3b82f6' },
  { name: 'グリーン',   light: '#dcfce7', dark: '#14532d', accent: '#22c55e' },
  { name: 'オレンジ',   light: '#ffedd5', dark: '#7c2d12', accent: '#f97316' },
  { name: 'パープル',   light: '#f3e8ff', dark: '#4c1d6b', accent: '#a855f7' },
  { name: 'ローズ',     light: '#ffe4e6', dark: '#7f1d2e', accent: '#f43f5e' },
  { name: 'ティール',   light: '#ccfbf1', dark: '#134e4a', accent: '#14b8a6' },
  { name: 'アンバー',   light: '#fef9c3', dark: '#713f12', accent: '#eab308' },
  { name: 'インディゴ', light: '#e0e7ff', dark: '#312e81', accent: '#6366f1' },
  { name: 'スカイ',     light: '#e0f2fe', dark: '#0c4a6e', accent: '#0ea5e9' },
  { name: 'スレート',   light: '#e2e8f0', dark: '#334155', accent: '#64748b' },
] as const;

export const PROCESS_COLOR_COUNT = PROCESS_COLORS.length;

// colorIndex から色定義を取り出す（範囲外は剰余でフォールバック）。
export function getProcessColor(colorIndex: number) {
  const idx = ((colorIndex % PROCESS_COLOR_COUNT) + PROCESS_COLOR_COUNT) % PROCESS_COLOR_COUNT;
  return PROCESS_COLORS[idx];
}

// 新規プロジェクト作成時に付与するデフォルトの列（カンバンのステータスレーン）。
// id は固定文字列にして、タスクの columnId と対応づける。
export function createDefaultColumns(): ProjectColumn[] {
  return [
    { id: 'todo', name: '未着手', order: 0, kind: 'todo' },
    { id: 'doing', name: '進行中', order: 1, kind: 'doing' },
    { id: 'done', name: '完了', order: 2, kind: 'done' },
    { id: 'hold', name: '保留', order: 3, kind: 'hold' },
  ];
}

// プロジェクトのステータス → 表示ラベル。
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: '進行中',
  archived: 'アーカイブ',
};

// 一覧のステータス絞り込み用のセグメント定義。
export const PROJECT_STATUS_SEGMENTS: Array<{ id: ProjectStatus; label: string }> = [
  { id: 'active', label: '進行中' },
  { id: 'archived', label: 'アーカイブ' },
];

// Firestore のコレクション名（タイプミス防止のため定数化）。
export const PROCESS_COLLECTIONS = {
  projects: 'projects',
  tasks: 'tasks',
  members: 'processMembers',
} as const;
