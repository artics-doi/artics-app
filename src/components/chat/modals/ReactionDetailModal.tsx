// リアクション詳細モーダル。Chat.tsx のインライン実装から機械的に移動（挙動変更なし）。
// スタイルは親ページの Chat.module.css をそのまま使う。

import type { ChatRoom } from '../../../types';
import styles from '../../../pages/Chat.module.css';

interface ReactionDetailModalProps {
  detail: {
    messageId: string;
    emoji: string;
    users: string[];
  };
  chatRoom: ChatRoom | null;
  currentUserId: string | undefined;
  getUserDisplayName: (userId: string) => string;
  onRemoveReaction: (messageId: string, emoji: string) => void;
  onClose: () => void;
}

export default function ReactionDetailModal({
  detail,
  chatRoom,
  currentUserId,
  getUserDisplayName,
  onRemoveReaction,
  onClose,
}: ReactionDetailModalProps) {
  return (
    <div className={styles.reactionDetailOverlay} onClick={onClose}>
      <div className={styles.reactionDetailModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.reactionDetailHeader}>
          <span className={styles.reactionDetailEmoji}>{detail.emoji}</span>
          <span className={styles.reactionDetailCount}>{detail.users.length}人がリアクション</span>
        </div>
        <div className={styles.reactionDetailList}>
          {detail.users.map((userId) => (
            <div key={userId} className={styles.reactionDetailItem}>
              <div className={styles.reactionDetailAvatar}>
                {chatRoom?.memberDetails[userId]?.photoURL ? (
                  <img src={chatRoom.memberDetails[userId].photoURL!} alt="" />
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
          {detail.users.includes(currentUserId || '') && (
            <button
              className={styles.reactionRemoveButton}
              onClick={() => onRemoveReaction(detail.messageId, detail.emoji)}
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
