import styles from '../../../pages/Home.module.css';
import useModal from '../../../hooks/useModal';

interface UserEditModalProps {
  isOpen: boolean;
  userEmail: string | undefined;
  editUserName: string;
  onClose: () => void;
  onEditUserNameChange: (name: string) => void;
  onSave: () => void;
}

export default function UserEditModal({
  isOpen,
  userEmail,
  editUserName,
  onClose,
  onEditUserNameChange,
  onSave
}: UserEditModalProps) {
  const { modalProps } = useModal({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={onClose}
      aria-labelledby="user-edit-modal-title"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="user-edit-modal-title">ユーザー編集</h2>
        <div className={styles.profileEditSection}>
          <div className={styles.profileNameEdit}>
            <label htmlFor="user-edit-display-name">表示名</label>
            <input
              id="user-edit-display-name"
              type="text"
              value={editUserName}
              onChange={(e) => onEditUserNameChange(e.target.value)}
              placeholder="名前を入力"
              className={styles.profileNameInput}
            />
          </div>
          <p className={styles.profileEmail}>{userEmail}</p>
        </div>
        <div className={styles.modalActions}>
          <button
            className={styles.createButton}
            onClick={onSave}
            disabled={!editUserName.trim()}
          >
            保存
          </button>
          <button className={styles.closeButton} onClick={onClose}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
