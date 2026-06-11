// タスク検索・絞り込みバー。Board.tsx から機械的に移動（挙動変更なし）。
// スタイルは親ページの Board.module.css をそのまま使う。

import type { TaskFilterState } from '../../lib/process/taskFilters';
import type { ProcessMember, ProjectColumn } from '../../types/process';
import styles from '../../pages/process/Board.module.css';

interface TaskFilterBarProps {
  taskFilters: TaskFilterState;
  updateTaskFilter: <K extends keyof TaskFilterState>(key: K, value: TaskFilterState[K]) => void;
  members: ProcessMember[];
  columns: ProjectColumn[];
  missingTaskCount: number;
  hasActiveFilters: boolean;
  onClear: () => void;
  filteredCount: number;
  totalCount: number;
}

export default function TaskFilterBar({
  taskFilters,
  updateTaskFilter,
  members,
  columns,
  missingTaskCount,
  hasActiveFilters,
  onClear,
  filteredCount,
  totalCount,
}: TaskFilterBarProps) {
  return (
    <section className={styles.taskFilterBar} aria-label="タスク検索と絞り込み">
      <div className={styles.searchFieldWrap}>
        <label className={styles.filterLabel} htmlFor="process-task-search">
          タスク検索
        </label>
        <input
          id="process-task-search"
          className={styles.searchInput}
          type="search"
          value={taskFilters.query}
          onChange={(event) => updateTaskFilter('query', event.target.value)}
          placeholder="タイトル・説明を検索"
        />
      </div>
      <label className={styles.compactFilter}>
        <span>担当者</span>
        <select
          value={taskFilters.assigneeId}
          onChange={(event) => updateTaskFilter('assigneeId', event.target.value)}
        >
          <option value="all">すべて</option>
          <option value="unassigned">未担当</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.compactFilter}>
        <span>ステータス</span>
        <select
          value={taskFilters.columnId}
          onChange={(event) => updateTaskFilter('columnId', event.target.value)}
        >
          <option value="all">すべて</option>
          {columns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.compactFilter}>
        <span>日付</span>
        <select
          value={taskFilters.dateFilter}
          onChange={(event) => updateTaskFilter('dateFilter', event.target.value as TaskFilterState['dateFilter'])}
        >
          <option value="all">すべて</option>
          <option value="complete">開始・終了あり</option>
          <option value="missing">日付未設定あり</option>
        </select>
      </label>
      <label className={styles.missingToggle}>
        <input
          type="checkbox"
          checked={taskFilters.missingOnly}
          onChange={(event) => updateTaskFilter('missingOnly', event.target.checked)}
        />
        未設定のみ
        <span className={styles.missingCount}>{missingTaskCount}</span>
      </label>
      {hasActiveFilters && (
        <button
          type="button"
          className={styles.clearFiltersButton}
          onClick={onClear}
        >
          クリア
        </button>
      )}
      <span className={styles.filterResultCount}>
        表示 {filteredCount} / 全{totalCount}
      </span>
    </section>
  );
}
