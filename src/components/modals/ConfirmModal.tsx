import styles from '../../pages/Chat.module.css';
import useModal from '../../hooks/useModal';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export default function ConfirmModal({
  title,
  message,
  confirmText = '確認',
  cancelText = 'キャンセル',
  onConfirm,
  onCancel,
  isDestructive = false
}: ConfirmModalProps) {
  const { modalProps } = useModal({ isOpen: true, onClose: onCancel });

  return (
    <div
      {...modalProps}
      className={styles.groupEditOverlay}
      onClick={onCancel}
      aria-labelledby="confirm-modal-title"
    >
      <div
        className={styles.groupEditModal}
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-modal-title" className={styles.groupEditTitle}>{title}</h2>
        <p style={{
          margin: '0 0 20px 0',
          fontSize: '14px',
          color: 'var(--text-secondary)',
          textAlign: 'center'
        }}>
          {message}
        </p>
        <div className={styles.groupEditButtons}>
          <button
            className={isDestructive ? styles.reactionRemoveButton : styles.groupEditSaveButton}
            onClick={onConfirm}
            style={isDestructive ? { flex: 1 } : undefined}
          >
            {confirmText}
          </button>
          <button
            className={styles.groupEditCancelButton}
            onClick={onCancel}
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
}
