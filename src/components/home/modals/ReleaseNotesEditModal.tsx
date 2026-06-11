import styles from '../../../pages/Home.module.css';
import useModal from '../../../hooks/useModal';

interface ReleaseNotesEditModalProps {
  isOpen: boolean;
  releaseNotesEdit: string;
  savingReleaseNotes: boolean;
  onClose: () => void;
  onReleaseNotesEditChange: (value: string) => void;
  onSave: () => void;
}

export default function ReleaseNotesEditModal({
  isOpen,
  releaseNotesEdit,
  savingReleaseNotes,
  onClose,
  onReleaseNotesEditChange,
  onSave
}: ReleaseNotesEditModalProps) {
  const { modalProps } = useModal({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={onClose}
      aria-labelledby="release-notes-edit-modal-title"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="release-notes-edit-modal-title">更新ノート編集</h2>
        <textarea
          className={styles.releaseNotesTextarea}
          value={releaseNotesEdit}
          onChange={(e) => onReleaseNotesEditChange(e.target.value)}
          placeholder="更新ノートを入力してください..."
          rows={10}
        />
        <div className={styles.modalActions}>
          <button
            className={styles.createButton}
            onClick={onSave}
            disabled={savingReleaseNotes}
          >
            {savingReleaseNotes ? '保存中...' : '保存'}
          </button>
          <button className={styles.closeButton} onClick={onClose}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
