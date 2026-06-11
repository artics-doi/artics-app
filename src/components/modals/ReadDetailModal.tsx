import styles from '../../pages/Chat.module.css';
import useModal from '../../hooks/useModal';

interface ReadDetailModalProps {
  readBy: string[];
  memberDetails: { [uid: string]: { displayName: string; photoURL?: string | null } };
  getUserDisplayName: (userId: string) => string;
  onClose: () => void;
}

export default function ReadDetailModal({
  readBy,
  memberDetails,
  getUserDisplayName,
  onClose
}: ReadDetailModalProps) {
  const { modalProps } = useModal({ isOpen: true, onClose });

  return (
    <div
      {...modalProps}
      className={styles.readDetailOverlay}
      onClick={onClose}
      aria-labelledby="read-detail-modal-title"
    >
      <div className={styles.readDetailModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.readDetailHeader}>
          <span id="read-detail-modal-title" className={styles.readDetailTitle}>既読</span>
          <span className={styles.readDetailCount}>{readBy.length}人が既読</span>
        </div>
        <div className={styles.readDetailList}>
          {readBy.map((userId) => (
            <div key={userId} className={styles.readDetailItem}>
              <div className={styles.readDetailAvatar}>
                {memberDetails[userId]?.photoURL ? (
                  <img src={memberDetails[userId].photoURL!} alt="" />
                ) : null}
              </div>
              <span className={styles.readDetailName}>
                {getUserDisplayName(userId)}
              </span>
            </div>
          ))}
        </div>
        <button
          className={styles.readDetailCloseButton}
          onClick={onClose}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
