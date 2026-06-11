// Firestore の生データ ⇔ 工程管理ドメイン型の相互変換を1箇所に隔離する。
//
// なぜ隔離するか:
//   Firestore は日時を Timestamp 型で返す（Date ではない）。UI 層のあちこちで
//   `.toDate()` を呼ぶと変換漏れやクラッシュの温床になる。useSchedules.ts と同じく、
//   変換はこのファイルの to*() 関数だけに集約し、UI 層は常に Date を扱う。

import { serverTimestamp, Timestamp, type DocumentData } from 'firebase/firestore';
import type {
  Project,
  ProjectColumn,
  ProjectInput,
  ProjectStatus,
  Task,
  TaskInput,
  ProcessMember,
  ProcessMemberInput,
} from '../../types/process';

// Timestamp → Date（null/undefined やそれ以外は null に）。
function timestampToDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

// --- 安全な値取り出しヘルパー（Firestore 生データは any 相当なので型ガードする） ---
function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}
function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

// 列配列を order 昇順で正規化（壊れたデータでも安全に並べる）。
function normalizeColumns(value: unknown): ProjectColumn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c): c is ProjectColumn => !!c && typeof c.id === 'string' && typeof c.name === 'string')
    .map((c) => ({ id: c.id, name: c.name, order: asNumber(c.order) }))
    .sort((a, b) => a.order - b.order);
}

const VALID_STATUS: ProjectStatus[] = ['active', 'archived'];

function asStatus(value: unknown): ProjectStatus {
  return VALID_STATUS.includes(value as ProjectStatus) ? (value as ProjectStatus) : 'active';
}

// ===== Firestore → ドメイン =====

export function toProject(id: string, data: DocumentData): Project {
  return {
    id,
    name: asString(data.name),
    description: asString(data.description),
    colorIndex: asNumber(data.colorIndex),
    status: asStatus(data.status),
    columns: normalizeColumns(data.columns),
    order: asString(data.order),
    pendingDelete: data.pendingDelete === true,
    createdBy: asString(data.createdBy),
    createdByName: asString(data.createdByName),
    createdAt: timestampToDate(data.createdAt),
    updatedAt: timestampToDate(data.updatedAt),
  };
}

export function toTask(id: string, data: DocumentData): Task {
  return {
    id,
    title: asString(data.title),
    projectId: asString(data.projectId),
    columnId: asString(data.columnId),
    assigneeIds: asStringArray(data.assigneeIds),
    startDate: timestampToDate(data.startDate),
    endDate: timestampToDate(data.endDate),
    description: asString(data.description),
    order: asString(data.order),
    ganttOrder: asString(data.ganttOrder) || asString(data.order),
    archived: data.archived === true,
    createdBy: asString(data.createdBy),
    createdByName: asString(data.createdByName),
    createdAt: timestampToDate(data.createdAt),
    updatedAt: timestampToDate(data.updatedAt),
  };
}

export function toMember(id: string, data: DocumentData): ProcessMember {
  return {
    id,
    name: asString(data.name),
    colorIndex: asNumber(data.colorIndex),
    order: asNumber(data.order),
    linkedUserId: typeof data.linkedUserId === 'string' ? data.linkedUserId : null,
  };
}

// ===== ドメイン → Input（既存タスクの部分更新用） =====

// Task から TaskInput を組み立てる（日付のみ差し替え可能）。Board / Gantt の日付変更確定で使用。
export function toTaskInput(task: Task, updates: Partial<Pick<TaskInput, 'startDate' | 'endDate'>> = {}): TaskInput {
  return {
    title: task.title,
    columnId: task.columnId,
    assigneeIds: task.assigneeIds,
    startDate: updates.startDate ?? task.startDate,
    endDate: updates.endDate ?? task.endDate,
    description: task.description,
  };
}

// ===== ドメイン（Input）→ Firestore 書き込みデータ =====
// createdAt/updatedAt や createdBy などサーバー値・作成者情報は呼び出し側(hooks)で付与する。
// ここでは「フォーム入力 → ドキュメントの素のフィールド」変換のみを担う。

// 作成者情報（hooks 側で currentUser から組み立てて渡す）。
export interface CreatorMeta {
  createdBy: string;
  createdByName: string;
}

// プロジェクト新規作成のドキュメントデータを組み立てる。
export function projectInputToCreateData(
  input: ProjectInput,
  columns: ProjectColumn[],
  order: string,
  creator: CreatorMeta,
) {
  return {
    name: input.name,
    description: input.description,
    colorIndex: input.colorIndex,
    status: 'active' as ProjectStatus,
    columns,
    order,
    createdBy: creator.createdBy,
    createdByName: creator.createdByName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

// プロジェクト更新（基本情報のみ。status/columns/pendingDelete は別 API で更新）。
export function projectInputToUpdateData(input: ProjectInput) {
  return {
    name: input.name,
    description: input.description,
    colorIndex: input.colorIndex,
    updatedAt: serverTimestamp(),
  };
}

// タスク新規作成のドキュメントデータ。【M1】archived は必ず false で埋める。
export function taskInputToCreateData(
  input: TaskInput,
  projectId: string,
  order: string,
  ganttOrder: string,
  creator: CreatorMeta,
) {
  return {
    title: input.title,
    projectId,
    columnId: input.columnId,
    assigneeIds: input.assigneeIds,
    startDate: input.startDate,
    endDate: input.endDate,
    description: input.description,
    order,
    ganttOrder,
    archived: false, // 【M1】等値 where が拾えるよう作成時に必ず埋める
    createdBy: creator.createdBy,
    createdByName: creator.createdByName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

// タスク更新（基本情報）。projectId / createdBy は不変なので含めない。
export function taskInputToUpdateData(input: TaskInput) {
  return {
    title: input.title,
    columnId: input.columnId,
    assigneeIds: input.assigneeIds,
    startDate: input.startDate,
    endDate: input.endDate,
    description: input.description,
    updatedAt: serverTimestamp(),
  };
}

// メンバー作成データ。
export function memberInputToCreateData(input: ProcessMemberInput, order: number) {
  return {
    name: input.name,
    colorIndex: input.colorIndex,
    linkedUserId: input.linkedUserId,
    order,
  };
}
