import { useState } from 'react';
import type { ChatRoom, ExtendedMessage } from '../../types';
import { formatTimeSmart } from '../../utils/dateUtils';
import styles from '../../pages/Chat.module.css';

interface DesktopRoomInfoPaneProps {
  room: ChatRoom;
  currentUserId: string | undefined;
  currentUserName: string | null | undefined;
  currentUserPhotoURL: string | null | undefined;
  onlineStatusMap: Record<string, boolean>;
  attachments: ExtendedMessage[];
  pinnedMessages: ExtendedMessage[];
  isOpen: boolean;
  onClose: () => void;
  onInvite: () => void;
  onOpenMessage: (messageId: string) => void;
}

function avatarLabel(name: string): string {
  return Array.from(name.trim())[0] || '?';
}

export default function DesktopRoomInfoPane({
  room,
  currentUserId,
  currentUserName,
  currentUserPhotoURL,
  onlineStatusMap,
  attachments,
  pinnedMessages,
  isOpen,
  onClose,
  onInvite,
  onOpenMessage,
}: DesktopRoomInfoPaneProps) {
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [showAllPinned, setShowAllPinned] = useState(false);
  const members = room.members.map((uid) => {
    const details = room.memberDetails?.[uid];
    return {
      uid,
      displayName: uid === currentUserId
        ? (currentUserName || details?.displayName || '自分')
        : (details?.displayName || '不明なユーザー'),
      photoURL: uid === currentUserId ? (currentUserPhotoURL ?? details?.photoURL) : details?.photoURL,
    };
  });

  return (
    <aside className={`${styles.desktopUtilityPane} ${isOpen ? styles.open : ''}`} aria-label="ルーム情報" aria-hidden={!isOpen}>
      <div className={styles.desktopInfoPaneHeader}>
        <h2>ルーム情報</h2>
        <button type="button" onClick={onClose} aria-label="ルーム情報を閉じる">×</button>
      </div>

      <section className={styles.desktopInfoCard}>
        <div className={styles.desktopInfoSectionTitle}>
          <h3>メンバー</h3>
          <span>{members.length}</span>
        </div>
        <div className={styles.desktopMemberList}>
          {members.map((member) => (
            <div key={member.uid} className={styles.desktopMemberRow}>
              <span className={styles.desktopMemberAvatar} aria-hidden="true">
                {member.photoURL ? <img src={member.photoURL} alt="" /> : avatarLabel(member.displayName)}
                {onlineStatusMap[member.uid] && <span className={styles.desktopOnlineDot} />}
              </span>
              <strong>{member.displayName}{member.uid === currentUserId ? '（あなた）' : ''}</strong>
            </div>
          ))}
        </div>
        {room.type === 'group' && (
          <button type="button" className={styles.desktopInfoAction} onClick={onInvite}>メンバーを追加</button>
        )}
      </section>

      <section className={styles.desktopInfoCard}>
        <div className={styles.desktopInfoSectionTitle}>
          <h3>共有ファイル</h3>
          <span>{attachments.length}</span>
        </div>
        <div className={styles.desktopInfoList}>
          {(showAllFiles ? attachments : attachments.slice(0, 4)).map((message) => (
            <button key={message.id} type="button" onClick={() => onOpenMessage(message.id)}>
              <span className={styles.desktopFileBadge} aria-hidden="true">FILE</span>
              <span>
                <strong>{message.fileName || (message.imageURL ? '画像' : 'ファイル')}</strong>
                <small>{message.senderName}・{formatTimeSmart(message.createdAt)}</small>
              </span>
            </button>
          ))}
          {attachments.length === 0 && <p className={styles.desktopLandingEmpty}>共有ファイルはまだありません。</p>}
        </div>
        {attachments.length > 4 && (
          <button type="button" className={styles.desktopInfoAction} onClick={() => setShowAllFiles((current) => !current)}>
            {showAllFiles ? '表示を減らす' : 'すべてのファイルを表示'}
          </button>
        )}
      </section>

      <section className={styles.desktopInfoCard}>
        <div className={styles.desktopInfoSectionTitle}>
          <h3>ピン留め</h3>
          <span>{pinnedMessages.length}</span>
        </div>
        <div className={styles.desktopInfoList}>
          {(showAllPinned ? pinnedMessages : pinnedMessages.slice(0, 3)).map((message) => (
            <button key={message.id} type="button" onClick={() => onOpenMessage(message.id)}>
              <span className={styles.desktopPinBadge} aria-hidden="true">PIN</span>
              <span>
                <strong>{message.text || '添付メッセージ'}</strong>
                <small>{message.senderName}・{formatTimeSmart(message.createdAt)}</small>
              </span>
            </button>
          ))}
          {pinnedMessages.length === 0 && <p className={styles.desktopLandingEmpty}>ピン留めはありません。</p>}
        </div>
        {pinnedMessages.length > 3 && (
          <button type="button" className={styles.desktopInfoAction} onClick={() => setShowAllPinned((current) => !current)}>
            {showAllPinned ? '表示を減らす' : 'すべてのピン留めを表示'}
          </button>
        )}
      </section>
    </aside>
  );
}
