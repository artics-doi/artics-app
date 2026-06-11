import styles from '../../../pages/Home.module.css';
import useModal from '../../../hooks/useModal';

interface StorageEditModalProps {
  isOpen: boolean;
  storageEditValue: string;
  onClose: () => void;
  onStorageEditValueChange: (value: string) => void;
  onSave: () => void;
}

export default function StorageEditModal({
  isOpen,
  storageEditValue,
  onClose,
  onStorageEditValueChange,
  onSave
}: StorageEditModalProps) {
  const { modalProps } = useModal({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={onClose}
      aria-labelledby="storage-edit-modal-title"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="storage-edit-modal-title">ストレージ使用量を編集</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Firebaseコンソールで確認した値を入力してください（MB単位）
        </p>
        <div className={styles.inputGroup}>
          <input
            type="number"
            step="0.01"
            value={storageEditValue}
            onChange={(e) => onStorageEditValueChange(e.target.value)}
            className={styles.textInput}
            placeholder="例: 1.36"
          />
          <span style={{ marginLeft: '8px' }}>MB</span>
        </div>
        <div className={styles.modalButtons}>
          <button className={styles.cancelButton} onClick={onClose}>
            キャンセル
          </button>
          <button className={styles.saveButton} onClick={onSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
