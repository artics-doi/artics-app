// 工程管理（process management）のドメイン型定義。
//
// 設計方針:
//   - Firestore の Timestamp は lib/process/converters.ts で Date に変換してから
//     これらの型に載せる（UI 層は常に Date を扱う）。createdAt / updatedAt は
//     serverTimestamp の反映前に一時的に null になりうるので null 許容にする。
//   - 書き込み用は *Input 型に分離する（id やサーバー値を含めない）。
//   - 行動予定表(schedules)とは完全に独立。型も共有しない。

// プロジェクトのステータス。'active'=表示中 / 'archived'=アーカイブ済み。
export type ProjectStatus = 'active' | 'archived';

// カンバンの列（ステータスレーン）。order は配列内の表示順（整数）。
export interface ProjectColumn {
  id: string;
  name: string;
  order: number;
  kind?: 'todo' | 'doing' | 'done' | 'hold' | 'custom';
}

// プロジェクト本体。
export interface Project {
  id: string;
  name: string;
  description: string;
  colorIndex: number; // PROCESS_COLORS のインデックス（識別色）
  status: ProjectStatus;
  columns: ProjectColumn[];
  order: string; // fractional index（一覧の並び順。lib/process/order.ts で採番）
  pendingDelete?: boolean; // true で Cloud Function が物理削除を行う
  lifecycleState?: 'active' | 'deleting';
  lifecycleVersion?: number;
  operationId?: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// プロジェクト書き込み用（新規作成・更新時にフォームから渡す値）。
export interface ProjectInput {
  name: string;
  description: string;
  colorIndex: number;
}

// タスク（カンバンのカード）。
export interface Task {
  id: string;
  title: string;
  projectId: string; // 不変（別PJへの付け替え禁止。ルールで担保）
  columnId: string; // 所属する列の id
  assigneeIds: string[];
  // 【M2】MVPデフォルト=描画時解決: 担当者名(assigneeNames)は保持しない。
  //   TaskCard 描画時に useProcessMembers の id→name lookup で解決する。
  //   人数≤20 かつ 同時PJ≤5 を超える規模になったら assigneeNames を非正規化し
  //   functions の同期トリガーを実装する（プラン §7-3 パターンA）。
  startDate: Date | null;
  endDate: Date | null;
  completedDate: Date | null;
  completionChecked: boolean;
  description: string;
  order: string; // fractional index（列内の並び順）
  ganttOrder: string; // fractional index（ガント専用の手動並び順。カンバン order とは独立）
  archived: boolean; // 所属PJのアーカイブに追従（createTime で必ず false を埋める / M1）
  isArchived: boolean; // 個別タスクのアーカイブ。通常の運用画面では非表示にする
  createdBy: string;
  createdByName: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// タスク書き込み用。
export interface TaskInput {
  title: string;
  columnId: string;
  assigneeIds: string[];
  startDate: Date | null;
  endDate: Date | null;
  completedDate: Date | null;
  completionChecked: boolean;
  description: string;
}

// 工程管理メンバー（担当者マスタ）。linkedUserId でチャットの users と紐付け可能。
export interface ProcessMember {
  id: string;
  name: string;
  colorIndex: number;
  order: number;
  linkedUserId: string | null;
  notification?: ProcessNotificationSettings;
  isTaskProgressManager?: boolean;
}

export type ProcessNotificationEvent = 'created' | 'todo' | 'doing' | 'done' | 'hold' | 'approved';
export interface ProcessNotificationSettings {
  events: ProcessNotificationEvent[];
}

// メンバー書き込み用。
export interface ProcessMemberInput {
  name: string;
  colorIndex: number;
  linkedUserId: string | null;
}
