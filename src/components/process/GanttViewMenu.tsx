// ガントの「表示・並び順」メニュー。Board.tsx から機械的に移動（挙動変更なし）。
// スタイルは親ページの Board.module.css をそのまま使う。

import type { GanttSortMode, ProcessGanttTask } from '../../lib/process/gantt';
import styles from '../../pages/process/Board.module.css';

interface GanttViewMenuProps {
  statusOptions: Array<{ id: ProcessGanttTask['processStatus']; label: string }>;
  sortOptions: Array<{ id: GanttSortMode; label: string }>;
  visibleCount: number;
  totalCount: number;
  draftVisibleGanttStatuses: Set<ProcessGanttTask['processStatus']>;
  toggleDraftStatus: (status: ProcessGanttTask['processStatus']) => void;
  draftGanttSortMode: GanttSortMode | null;
  setDraftGanttSortMode: (mode: GanttSortMode | null) => void;
  onReset: () => void;
  onApply: () => void;
}

export default function GanttViewMenu({
  statusOptions,
  sortOptions,
  visibleCount,
  totalCount,
  draftVisibleGanttStatuses,
  toggleDraftStatus,
  draftGanttSortMode,
  setDraftGanttSortMode,
  onReset,
  onApply,
}: GanttViewMenuProps) {
  return (
    <div className={styles.ganttViewMenu} role="dialog" aria-label="表示・並び順">
      <div className={styles.ganttViewMenuHeader}>
        <h2>表示・並び順</h2>
        <span className={styles.visibilityChip}>
          表示中 {visibleCount}件 / 全{totalCount}件
        </span>
      </div>
      <section className={styles.ganttViewMenuSection}>
        <h3>表示するステータス</h3>
        <div className={styles.statusFilterList}>
          {statusOptions.map((status) => (
            <label key={status.id} className={styles.statusFilterItem}>
              <input
                type="checkbox"
                checked={draftVisibleGanttStatuses.has(status.id)}
                onChange={() => toggleDraftStatus(status.id)}
              />
              <span
                className={`${styles.statusDot} ${styles[`statusDot_${status.id}`]}`}
                aria-hidden="true"
              />
              {status.label}
            </label>
          ))}
        </div>
      </section>
      <section className={styles.ganttViewMenuSection}>
        <h3>一括並び替え</h3>
        <div className={styles.sortOptionList}>
          {sortOptions.map((option) => (
            <label key={option.id} className={styles.sortOptionItem}>
              <input
                type="radio"
                name="ganttSortMode"
                checked={draftGanttSortMode === option.id}
                onChange={() => setDraftGanttSortMode(option.id)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </section>
      <p className={styles.ganttViewHint}>
        ドラッグ操作も一括並び替えもガント順だけ変更します。
      </p>
      <div className={styles.ganttViewMenuActions}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onReset}
        >
          リセット
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={onApply}
        >
          適用
        </button>
      </div>
    </div>
  );
}
