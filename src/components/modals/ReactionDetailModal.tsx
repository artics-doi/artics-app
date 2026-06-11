import styles from '../../pages/Chat.module.css';
import useModal from '../../hooks/useModal';

interface ReactionDetailModalProps {
  emoji: string;
  users: string[];
  currentUserId?: string;
  memberDetails: { [uid: string]: { displayName: string; photoURL?: string | null } };
  getUserDisplayName: (userId: string) => string;
  onRemoveReaction: () => void;
  onClose: () => void;
}

export default function ReactionDetailModal({
  emoji,
  users,
  currentUserId,
  memberDetails,
  getUserDisplayName,
  onRemoveReaction,
  onClose
}: ReactionDetailModalProps) {
  const { modalProps } = useModal({ isOpen: true, onClose });

  return (
    <div
      {...modalProps}
      className={styles.reactionDetailOverlay}
      onClick={onClose}
      aria-labelledby="reaction-detail-modal-title"
    >
      <div className={styles.reactionDetailModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.reactionDetailHeader}>
          <span id="reaction-detail-modal-title" className={styles.reactionDetailEmoji}>{emoji}</span>
          <span className={styles.reactionDetailCount}>{users.length}人がリアクション</span>
        </div>
        <div className={styles.reactionDetailList}>
          {users.map((userId) => (
            <div key={userId} className={styles.reactionDetailItem}>
              <div className={styles.reactionDetailAvatar}>
                {memberDetails[userId]?.photoURL ? (
                  <img src={memberDetails[userId].photoURL!} alt="" />
                ) : null}
              </div>
              <span className={styles.reactionDetailName}>
                {getUserDisplayName(userId)}
                {userId === currentUserId && <span className={styles.reactionDetailYou}>(あなた)</span>}
              </span>
            </div>
          ))}
        </div>
        <div className={styles.reactionDetailButtons}>
          {users.includes(currentUserId || '') && (
            <button
              className={styles.reactionRemoveButton}
              onClick={onRemoveReaction}
            >
              リアクションを取り消す
            </button>
          )}
          <button
            className={styles.reactionDetailCloseButton}
            onClick={onClose}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
