import styles from '../../pages/Chat.module.css';

interface ChatHeaderProps {
  roomName: string;
  roomType: 'direct' | 'group';
  memberCount?: number;
  otherUserOnline?: boolean | null;
  pinnedMessagesCount: number;
  isMuted: boolean;
  onBack: () => void;
  onShowMemberList: () => void;
  onEditGroup: () => void;
  onInvite: () => void;
  onTogglePinnedMessages: () => void;
  onToggleMute: () => void;
}

export default function ChatHeader({
  roomName,
  roomType,
  memberCount,
  otherUserOnline,
  pinnedMessagesCount,
  isMuted,
  onBack,
  onShowMemberList,
  onEditGroup,
  onInvite,
  onTogglePinnedMessages,
  onToggleMute
}: ChatHeaderProps) {
  return (
    <header className={styles.header}>
      <button className={styles.backButton} onClick={onBack}>
        ←
      </button>
      <div className={styles.roomInfo}>
        <div className={styles.roomNameContainer}>
          <h1 className={styles.roomName}>{roomName}</h1>
          {roomType === 'direct' && otherUserOnline !== null && (
            <span className={otherUserOnline ? styles.headerOnlineIndicator : styles.headerOfflineIndicator}></span>
          )}
        </div>
        {roomType === 'group' && memberCount && (
          <span className={styles.memberCount}>
            {memberCount}人のメンバー
          </span>
        )}
        {roomType === 'direct' && otherUserOnline !== null && (
          <span className={otherUserOnline ? styles.onlineStatus : styles.offlineStatus}>
            {otherUserOnline ? 'オンライン' : 'オフライン'}
          </span>
        )}
      </div>
      {roomType === 'group' && (
        <>
          <button
            className={styles.memberListButton}
            onClick={onShowMemberList}
            title="メンバー一覧"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </button>
          <button
            className={styles.editGroupButton}
            onClick={onEditGroup}
            title="グループを編集"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            className={styles.inviteButton}
            onClick={onInvite}
            title="メンバーを招待"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
          </button>
        </>
      )}
      {pinnedMessagesCount > 0 && (
        <button
          className={styles.pinButton}
          onClick={onTogglePinnedMessages}
          title="ピン留めメッセージ"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
          </svg>
          <span className={styles.pinCount}>{pinnedMessagesCount}</span>
        </button>
      )}
      <button
        className={`${styles.notificationToggle} ${isMuted ? styles.muted : ''}`}
        onClick={onToggleMute}
        title={isMuted ? '通知をオンにする' : '通知をオフにする'}
      >
        {isMuted ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
            <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
            <path d="M18 8a6 6 0 0 0-9.33-5" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        )}
      </button>
    </header>
  );
}
