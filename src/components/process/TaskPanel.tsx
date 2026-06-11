// タスクの新規作成 / 編集モーダル。
// title / columnId / assigneeIds / startDate / endDate / description を編集する。

import { useEffect, useRef, useState } from 'react';
import type { ProcessMember, ProjectColumn, Task, TaskInput } from '../../types/process';
import { dateToInputValue, inputValueToDate } from '../../lib/process/dateInput';
import MemberPicker from './MemberPicker';
import { CloseIcon } from './icons';
import styles from './ProcessModal.module.css';

interface TaskPanelProps {
  task: Task | null; // null なら新規作成
  columns: ProjectColumn[];
  defaultColumnId: string; // 新規作成時の初期列
  members: ProcessMember[];
  onSubmit: (input: TaskInput) => Promise<void>;
  onDelete?: () => Promise<void>; // 編集時のみ
  onDuplicate?: () => Promise<void>; // 編集時のみ
  onClose: () => void;
}

export default function TaskPanel({
  task,
  columns,
  defaultColumnId,
  members,
  onSubmit,
  onDelete,
  onDuplicate,
  onClose,
}: TaskPanelProps) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [columnId, setColumnId] = useState(task?.columnId ?? defaultColumnId);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task?.assigneeIds ?? []);
  const [startDate, setStartDate] = useState(dateToInputValue(task?.startDate ?? null));
  const [endDate, setEndDate] = useState(dateToInputValue(task?.endDate ?? null));
  const [description, setDescription] = useState(task?.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [dateError, setDateError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canSubmit = title.trim().length > 0 && !submitting;

  const handleStartDateChange = (nextStartDate: string) => {
    setStartDate(nextStartDate);
    setDateError('');

    const nextStart = inputValueToDate(nextStartDate);
    const currentEnd = inputValueToDate(endDate);
    if (nextStart && (!currentEnd || currentEnd.getTime() < nextStart.getTime())) {
      setEndDate(nextStartDate);
    }
  };

  const handleEndDateChange = (nextEndDate: string) => {
    setEndDate(nextEndDate);
    setDateError('');
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const start = inputValueToDate(startDate);
    const end = inputValueToDate(endDate);
    // 終了日が開始日より前なら弾く（両方ある場合のみ）。
    if (start && end && end.getTime() < start.getTime()) {
      setDateError('終了日は開始日以降にしてください。');
      return;
    }
    setDateError('');
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        columnId,
        assigneeIds,
        startDate: start,
        endDate: end,
        description: description.trim(),
      });
      onClose();
    } catch (err) {
      console.error('[Process] タスク保存エラー:', err);
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={`${styles.modal} ${styles.modalWide}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="task-panel-title" className={styles.title}>
            {task ? 'タスクを編集' : '新しいタスク'}
          </h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="閉じる">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="task-title">
            タイトル
          </label>
          <input
            ref={titleRef}
            id="task-title"
            className={styles.input}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 仕様書レビュー"
            maxLength={200}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="task-column">
            ステータス（列）
          </label>
          <select
            id="task-column"
            className={styles.input}
            value={columnId}
            onChange={(e) => setColumnId(e.target.value)}
          >
            {columns.map((col) => (
              <option key={col.id} value={col.id}>
                {col.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>担当者</span>
          <MemberPicker members={members} selectedIds={assigneeIds} onChange={setAssigneeIds} />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className={styles.field} style={{ flex: 1 }}>
            <label className={styles.label} htmlFor="task-start">
              開始日
            </label>
            <input
              id="task-start"
              className={styles.input}
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
            />
          </div>
          <div className={styles.field} style={{ flex: 1 }}>
            <label className={styles.label} htmlFor="task-end">
              終了日
            </label>
            <input
              id="task-end"
              className={styles.input}
              type="date"
              min={startDate || undefined}
              value={endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
            />
          </div>
        </div>
        {dateError && (
          <p style={{ color: 'var(--danger-color)', fontSize: 13, margin: '-8px 0 8px' }}>{dateError}</p>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="task-desc">
            説明（任意）
          </label>
          <textarea
            id="task-desc"
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="詳細やメモ"
            maxLength={2000}
          />
        </div>

        <div className={styles.footer}>
          {task && onDelete && (
            <button
              type="button"
              className={styles.secondaryButton}
              style={{ marginRight: 'auto', color: 'var(--danger-color)' }}
              onClick={async () => {
                await onDelete();
                onClose();
              }}
            >
              削除
            </button>
          )}
          {task && onDuplicate && (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={async () => {
                await onDuplicate();
                onClose();
              }}
            >
              複製
            </button>
          )}
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {task ? '保存' : '作成'}
          </button>
        </div>
      </div>
    </div>
  );
}
