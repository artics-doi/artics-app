import type { ChatRoom } from '../../types';
import styles from '../../pages/Home.module.css';

interface ChatItemProps {
  room: ChatRoom;
  unreadCount: number;
  isMuted: boolean;
  displayName: string;
  photoURL?: string | null;
  onClick: () => void;
  onInvite?: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

export default function ChatItem({
  room,
  unreadCount,
  isMuted,
  displayName,
  photoURL,
  onClick,
  onInvite,
  onDelete
}: ChatItemProps) {
  return (
    <div className={styles.chatItem} onClick={onClick}>
      <div className={styles.chatAvatar}>
        {photoURL && (
          <img src={photoURL} alt="" className={styles.chatAvatarImage} />
        )}
      </div>
      <div className={styles.chatInfo}>
        <div className={styles.chatHeader}>
          <span className={styles.chatName}>
            {unreadCount > 0 && (
              <span
                className={styles.unreadBadge}
                aria-label={`未読メッセージ ${unreadCount > 99 ? '99件以上' : `${unreadCount}件`}`}
              >
                {/* M-12: 未読 99+ は固定幅で表示崩れを防ぐ */}
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            {displayName}
            {isMuted && (
              <span className={styles.mutedIndicator} title="通知オフ">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
                  <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
                  <path d="M18 8a6 6 0 0 0-9.33-5" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </span>
            )}
            {room.type === 'group' && (
              <span className={styles.memberCount}>({room.members.length}人)</span>
            )}
          </span>
        </div>
        <div className={styles.chatFooter}>
          <p className={styles.lastMessage}>
            {room.lastMessage
              ? `${room.lastMessage.senderName}: ${room.lastMessage.text}`
              : 'メッセージがありません'}
          </p>
        </div>
      </div>
      <div className={styles.chatActions}>
        {room.type === 'group' && onInvite && (
          <button
            className={styles.inviteButton}
            onClick={onInvite}
            title="メンバー招待"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
          </button>
        )}
        <button
          className={styles.deleteButton}
          onClick={onDelete}
          title="削除"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
