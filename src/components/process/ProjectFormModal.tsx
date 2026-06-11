// プロジェクトの新規作成 / 編集モーダル。name / description / colorIndex を編集する。

import { useEffect, useRef, useState } from 'react';
import { PROCESS_COLORS } from '../../constants/process';
import type { Project, ProjectInput } from '../../types/process';
import { CloseIcon } from './icons';
import styles from './ProcessModal.module.css';

interface ProjectFormModalProps {
  // 編集対象。null なら新規作成。
  project: Project | null;
  onSubmit: (input: ProjectInput) => Promise<void>;
  onClose: () => void;
}

export default function ProjectFormModal({ project, onSubmit, onClose }: ProjectFormModalProps) {
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [colorIndex, setColorIndex] = useState(project?.colorIndex ?? 0);
  const [submitting, setSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // 開いたら名前入力にフォーカス（autoFocus 属性は a11y ルールで禁止のため ref で行う）。
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // Esc で閉じる。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canSubmit = name.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), description: description.trim(), colorIndex });
      onClose();
    } catch (err) {
      console.error('[Process] プロジェクト保存エラー:', err);
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="project-form-title" className={styles.title}>
            {project ? 'プロジェクトを編集' : '新しいプロジェクト'}
          </h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="閉じる">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="project-name">
            プロジェクト名
          </label>
          <input
            ref={nameInputRef}
            id="project-name"
            className={styles.input}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 新製品開発スケジュール"
            maxLength={100}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="project-desc">
            説明（任意）
          </label>
          <textarea
            id="project-desc"
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="プロジェクトの目的やメモ"
            maxLength={500}
          />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>識別色</span>
          <div className={styles.colorRow}>
            {PROCESS_COLORS.map((color, idx) => (
              <button
                key={color.name}
                type="button"
                className={`${styles.colorSwatch} ${idx === colorIndex ? styles.colorSwatchSelected : ''}`}
                style={{ background: color.accent }}
                onClick={() => setColorIndex(idx)}
                aria-label={color.name}
                aria-pressed={idx === colorIndex}
              />
            ))}
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {project ? '保存' : '作成'}
          </button>
        </div>
      </div>
    </div>
  );
}
