// 既読詳細モーダル。Chat.tsx のインライン実装から機械的に移動（挙動変更なし）。
// スタイルは親ページの Chat.module.css をそのまま使う。

import type { ChatRoom } from '../../../types';
import styles from '../../../pages/Chat.module.css';

interface ReadDetailModalProps {
  detail: {
    messageId: string;
    readBy: string[];
  };
  chatRoom: ChatRoom | null;
  getUserDisplayName: (userId: string) => string;
  onClose: () => void;
}

export default function ReadDetailModal({
  detail,
  chatRoom,
  getUserDisplayName,
  onClose,
}: ReadDetailModalProps) {
  return (
    <div className={styles.readDetailOverlay} onClick={onClose}>
      <div className={styles.readDetailModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.readDetailHeader}>
          <span className={styles.readDetailTitle}>既読</span>
          <span className={styles.readDetailCount}>{detail.readBy.length}人が既読</span>
        </div>
        <div className={styles.readDetailList}>
          {detail.readBy.map((userId) => (
            <div key={userId} className={styles.readDetailItem}>
              <div className={styles.readDetailAvatar}>
                {chatRoom?.memberDetails[userId]?.photoURL ? (
                  <img src={chatRoom.memberDetails[userId].photoURL!} alt="" />
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
