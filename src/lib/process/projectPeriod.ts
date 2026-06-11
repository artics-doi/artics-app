// プロジェクトの期間（最早開始日〜最遅終了日）をタスク配列から算出する純ロジック。
// ガントチャートの全体バーや一覧の期間表示に使う。

import type { Task } from '../../types/process';

export interface ProjectPeriod {
  start: Date | null; // タスク中で最も早い startDate（無ければ null）
  end: Date | null; // タスク中で最も遅い endDate（無ければ null）
}

/**
 * タスク配列から期間を求める。
 * - startDate/endDate が null のタスクはその端の計算から除外する。
 * - 全タスクが日付未設定なら { start: null, end: null }。
 * - アーカイブ済みタスクを含めたくない場合は呼び出し側で事前にフィルタする。
 */
export function calcProjectPeriod(tasks: readonly Task[]): ProjectPeriod {
  let start: Date | null = null;
  let end: Date | null = null;

  for (const task of tasks) {
    if (task.startDate && (start === null || task.startDate.getTime() < start.getTime())) {
      start = task.startDate;
    }
    if (task.endDate && (end === null || task.endDate.getTime() > end.getTime())) {
      end = task.endDate;
    }
  }

  return { start, end };
}
