// カンバンのタスクカード。@dnd-kit でドラッグ可能。
// 担当者名は memberById で描画時に解決する（M2: assigneeNames は保持しない）。

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { accentOf } from '../../lib/process/colors';
import type { ProcessMember, Task } from '../../types/process';
import { dateToInputValue } from '../../lib/process/dateInput';
import { defaultCompletedDate } from '../../lib/process/completion';
import { getTaskMissingCheck } from '../../lib/process/taskFilters';
import { ArchiveIcon, RestoreIcon } from './icons';
import styles from '../../pages/process/Board.module.css';

interface TaskCardProps {
  task: Task;
  memberById: Map<string, ProcessMember>;
  datePreview?: Pick<Task, 'startDate' | 'endDate' | 'completedDate'>;
  showCompletionControls: boolean;
  onClick: () => void;
  onCompletedChange: (completed: boolean) => Promise<void> | void;
  onArchivedChange: (archived: boolean) => Promise<void> | void;
}

function taskDateRangeText(
  dates: Pick<Task, 'startDate' | 'endDate' | 'completedDate'>,
  showCompletedDate: boolean,
): string | null {
  const completedDate = showCompletedDate ? dates.completedDate ?? defaultCompletedDate() : null;
  if (dates.startDate && dates.endDate) {
    const planned = `${dateToInputValue(dates.startDate)} - ${dateToInputValue(dates.endDate)}`;
    return completedDate ? `${planned} / 完了 ${dateToInputValue(completedDate)}` : planned;
  }
  if (dates.startDate) return `${dateToInputValue(dates.startDate)} - 未設定`;
  if (dates.endDate) return `未設定 - ${dateToInputValue(dates.endDate)}`;
  if (completedDate) return `完了 ${dateToInputValue(completedDate)}`;
  return null;
}

export default function TaskCard({
  task,
  memberById,
  datePreview,
  showCompletionControls,
  onClick,
  onCompletedChange,
  onArchivedChange,
}: TaskCardProps) {
  const [optimisticCompleted, setOptimisticCompleted] = useState<{
    taskId: string;
    value: boolean;
  } | null>(null);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const displayDates = datePreview ?? task;
  const dateRangeText = taskDateRangeText(displayDates, showCompletionControls);
  const missing = getTaskMissingCheck(task);
  const hasPendingCompletion =
    optimisticCompleted?.taskId === task.id && optimisticCompleted.value !== task.completionChecked;
  const isCompleted = showCompletionControls && (hasPendingCompletion ? optimisticCompleted.value : task.completionChecked);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.card} ${isCompleted ? styles.cardCompleted : ''} ${task.isArchived ? styles.cardArchived : ''} ${isDragging ? styles.cardDragging : ''}`}
      data-testid="process-task-card"
      {...attributes}
      {...listeners}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick();
      }}
    >
      <div className={showCompletionControls ? styles.cardTitleRow : styles.cardTitleRowPlain}>
        {showCompletionControls && (
          <label
            className={styles.cardCompleteCheck}
            aria-label={`${task.title}の完了状態を切り替え`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isCompleted}
              onChange={(e) => {
                const nextCompleted = e.target.checked;
                setOptimisticCompleted({ taskId: task.id, value: nextCompleted });
                Promise.resolve(onCompletedChange(nextCompleted)).catch((err) => {
                  console.error('[Process] 完了チェック保存エラー:', err);
                  setOptimisticCompleted(null);
                });
              }}
            />
          </label>
        )}
        <p className={styles.cardTitle}>{task.title}</p>
        <button
          type="button"
          className={styles.cardArchiveButton}
          title={task.isArchived ? 'タスクを復元' : 'タスクをアーカイブ'}
          aria-label={`${task.title}を${task.isArchived ? '復元' : 'アーカイブ'}`}
          disabled={archiveSaving}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setArchiveSaving(true);
            Promise.resolve(onArchivedChange(!task.isArchived))
              .catch((error) => console.error('[Process] アーカイブ保存エラー:', error))
              .finally(() => setArchiveSaving(false));
          }}
        >
          {task.isArchived ? <RestoreIcon size={15} /> : <ArchiveIcon size={15} />}
        </button>
      </div>
      {task.description && <p className={styles.cardDescription}>{task.description}</p>}
      {(missing.assignee || missing.startDate || missing.endDate) && (
        <div className={styles.missingBadges} aria-label="未設定項目">
          {missing.assignee && <span>担当未設定</span>}
          {missing.startDate && <span>開始未設定</span>}
          {missing.endDate && <span>終了未設定</span>}
        </div>
      )}
      <div className={styles.cardMeta}>
        {task.assigneeIds.map((id) => {
          const member = memberById.get(id);
          if (!member) return null;
          return (
            <span key={id} className={styles.assignee}>
              <span
                className={styles.assigneeDot}
                style={{ background: accentOf(member.colorIndex) }}
                aria-hidden="true"
              />
              <span className={styles.assigneeName}>{member.name}</span>
            </span>
          );
        })}
        {dateRangeText && (
          <span className={styles.dueDate}>
            {dateRangeText}
          </span>
        )}
      </div>
    </div>
  );
}
