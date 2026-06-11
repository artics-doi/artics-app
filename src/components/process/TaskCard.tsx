// カンバンのタスクカード。@dnd-kit でドラッグ可能。
// 担当者名は memberById で描画時に解決する（M2: assigneeNames は保持しない）。

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PROCESS_COLORS, PROCESS_COLOR_COUNT } from '../../constants/process';
import type { ProcessMember, Task } from '../../types/process';
import { dateToInputValue } from '../../lib/process/dateInput';
import { getTaskMissingCheck } from '../../lib/process/taskFilters';
import styles from '../../pages/process/Board.module.css';

interface TaskCardProps {
  task: Task;
  memberById: Map<string, ProcessMember>;
  datePreview?: Pick<Task, 'startDate' | 'endDate'>;
  onClick: () => void;
}

function accentOf(colorIndex: number): string {
  const idx = ((colorIndex % PROCESS_COLOR_COUNT) + PROCESS_COLOR_COUNT) % PROCESS_COLOR_COUNT;
  return PROCESS_COLORS[idx].accent;
}

function taskDateRangeText(dates: Pick<Task, 'startDate' | 'endDate'>): string | null {
  if (dates.startDate && dates.endDate) {
    return `${dateToInputValue(dates.startDate)} - ${dateToInputValue(dates.endDate)}`;
  }
  if (dates.startDate) return `${dateToInputValue(dates.startDate)} - 未設定`;
  if (dates.endDate) return `未設定 - ${dateToInputValue(dates.endDate)}`;
  return null;
}

export default function TaskCard({ task, memberById, datePreview, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const displayDates = datePreview ?? task;
  const dateRangeText = taskDateRangeText(displayDates);
  const missing = getTaskMissingCheck(task);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.card} ${isDragging ? styles.cardDragging : ''}`}
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
      <p className={styles.cardTitle}>{task.title}</p>
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
