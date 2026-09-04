import styles from '../../../pages/Home.module.css';
import useModal from '../../../hooks/useModal';

interface DeleteUserConfirmModalProps {
  isOpen: boolean;
  userName: string | undefined;
  onClose: () => void;
  onDelete: () => void;
  deletionState?: string | null;
}

export default function DeleteUserConfirmModal({
  isOpen,
  userName,
  onClose,
  onDelete,
  deletionState = null
}: DeleteUserConfirmModalProps) {
  const { modalProps } = useModal({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={deletionState ? undefined : onClose}
      aria-labelledby="delete-user-modal-title"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="delete-user-modal-title">ユーザーを削除</h2>
        <p className={styles.deleteWarning}>
          「{userName}」を削除しますか？<br />
          この操作は取り消せません。
        </p>
        <p className={styles.deleteNote}>
          ※ Firebase Authenticationからの削除は<br />
          別途管理コンソールで行ってください
        </p>
        {deletionState && <p role="status">削除処理: {deletionState}</p>}
        <div className={styles.modalActions}>
          <button
            className={styles.deleteConfirmButton}
            onClick={onDelete}
            disabled={Boolean(deletionState)}
          >
            削除
          </button>
          <button className={styles.closeButton} onClick={onClose} disabled={Boolean(deletionState)}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
