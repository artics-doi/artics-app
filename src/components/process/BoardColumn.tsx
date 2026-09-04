// カンバンの1列。列ヘッダー（名前編集/件数/メニュー）+ ドロップ可能なカードリスト +
// インラインカード追加フォーム。

import { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ProcessMember, ProjectColumn, Task } from '../../types/process';
import TaskCard from './TaskCard';
import { MoreIcon, PlusIcon } from './icons';
import styles from '../../pages/process/Board.module.css';

interface BoardColumnProps {
  column: ProjectColumn;
  columns: ProjectColumn[];
  tasks: Task[];
  memberById: Map<string, ProcessMember>;
  datePreviewByTaskId?: Map<string, Pick<Task, 'startDate' | 'endDate' | 'completedDate'>>;
  isLocked?: boolean;
  isDoneColumn: boolean;
  isCreating: boolean;
  onStartCreate: () => void;
  onCancelCreate: () => void;
  onCreateTask: (title: string) => Promise<void>;
  onTaskClick: (task: Task) => void;
  onTaskCompletedChange: (task: Task, completed: boolean) => void;
  onTaskArchivedChange: (task: Task, archived: boolean) => Promise<void> | void;
  onRenameColumn: (name: string) => void;
  onDeleteColumn: () => void;
}

function columnToneClass(columnId: string): string {
  switch (columnId) {
    case 'doing':
      return styles.column_doing;
    case 'done':
      return styles.column_done;
    case 'hold':
      return styles.column_hold;
    default:
      return '';
  }
}

export default function BoardColumn({
  column,
  tasks,
  memberById,
  datePreviewByTaskId,
  isLocked = false,
  isDoneColumn,
  isCreating,
  onStartCreate,
  onCancelCreate,
  onCreateTask,
  onTaskClick,
  onTaskCompletedChange,
  onTaskArchivedChange,
  onRenameColumn,
  onDeleteColumn,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(column.name);
  const [newTitle, setNewTitle] = useState('');
  const newTitleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isCreating) newTitleRef.current?.focus();
  }, [isCreating]);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== column.name) onRenameColumn(trimmed);
    else setNameDraft(column.name);
    setEditingName(false);
  };

  const commitNewTask = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      onCancelCreate();
      setNewTitle('');
      return;
    }
    await onCreateTask(trimmed);
    setNewTitle('');
  };

  return (
    <div className={`${styles.column} ${columnToneClass(column.id)}`}>
      <div className={styles.columnHeader}>
        {isLocked ? (
          <span className={styles.columnNameLocked}>{column.name}</span>
        ) : editingName ? (
          <input
            className={styles.columnNameInput}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') {
                setNameDraft(column.name);
                setEditingName(false);
              }
            }}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        ) : (
          <button
            type="button"
            className={styles.columnName}
            style={{ textAlign: 'left', cursor: 'text' }}
            onClick={() => {
              setNameDraft(column.name);
              setEditingName(true);
            }}
          >
            {column.name}
          </button>
        )}
        <span className={styles.columnCount}>{tasks.length}</span>
        {!isLocked && (
          <button
            type="button"
            className={styles.columnMenuButton}
            aria-label="列メニュー"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreIcon size={16} />
          </button>
        )}
        {!isLocked && menuOpen && (
          <div className={styles.columnMenu} style={{ top: 28, right: 0 }} onMouseLeave={() => setMenuOpen(false)}>
            <button
              type="button"
              className={styles.columnMenuItem}
              onClick={() => {
                setNameDraft(column.name);
                setEditingName(true);
                setMenuOpen(false);
              }}
            >
              名前を変更
            </button>
            <button
              type="button"
              className={`${styles.columnMenuItem} ${styles.columnMenuItemDanger}`}
              onClick={() => {
                onDeleteColumn();
                setMenuOpen(false);
              }}
            >
              列を削除
            </button>
          </div>
        )}
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`${styles.cardListWrap} ${isOver ? styles.cardListDropTarget : ''}`}
        >
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              memberById={memberById}
              datePreview={datePreviewByTaskId?.get(task.id)}
              showCompletionControls={isDoneColumn}
              onClick={() => onTaskClick(task)}
              onCompletedChange={(completed) => onTaskCompletedChange(task, completed)}
              onArchivedChange={(archived) => onTaskArchivedChange(task, archived)}
            />
          ))}
        </div>
      </SortableContext>

      {isCreating ? (
        <div className={styles.addCardForm}>
          <textarea
            ref={newTitleRef}
            className={styles.addCardInput}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="タスク名を入力（Enter で追加）"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commitNewTask();
              }
              if (e.key === 'Escape') {
                onCancelCreate();
                setNewTitle('');
              }
            }}
            onBlur={commitNewTask}
          />
        </div>
      ) : (
        <button type="button" className={styles.addCardButton} onClick={onStartCreate}>
          <PlusIcon size={14} /> タスクを追加
        </button>
      )}
    </div>
  );
}
