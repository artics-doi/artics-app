import useModal from '../../../hooks/useModal';
import type { ChatRoom } from '../../../types';
import { StatusDot } from '../../StatusDot';
import statusDotStyles from '../../StatusDot.module.css';
import styles from '../../../pages/Chat.module.css';

interface MemberListModalProps {
  isOpen: boolean;
  chatRoom: ChatRoom;
  currentUserId?: string;
  currentUserName?: string | null;
  currentUserPhotoURL?: string | null;
  onlineStatusMap?: Record<string, boolean>;
  onLeave?: () => void;
  onClose: () => void;
}

export default function MemberListModal({
  isOpen,
  chatRoom,
  currentUserId,
  currentUserName,
  currentUserPhotoURL,
  onlineStatusMap,
  onLeave,
  onClose
}: MemberListModalProps) {
  const { modalProps } = useModal({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      {...modalProps}
      className={styles.groupEditOverlay}
      onClick={onClose}
      aria-labelledby="member-list-modal-title"
    >
      <div className={styles.memberListModal} onClick={(e) => e.stopPropagation()}>
        <h2 id="member-list-modal-title" className={styles.groupEditTitle}>メンバー一覧</h2>
        <div className={styles.memberListContent}>
          {chatRoom.members.map((memberId) => {
            const memberDetails = chatRoom.memberDetails[memberId];
            const isCurrentUser = memberId === currentUserId;
            const displayName = memberDetails?.displayName || (isCurrentUser ? currentUserName : 'Unknown') || 'Unknown';
            const photoURL = memberDetails?.photoURL || (isCurrentUser ? currentUserPhotoURL : null);

            return (
              <div key={memberId} className={styles.memberListItem}>
                <div className={statusDotStyles.avatarWrapper}>
                  <div className={styles.memberListAvatar}>
                    {photoURL ? (
                      <img src={photoURL} alt="" className={styles.memberListAvatarImage} />
                    ) : null}
                  </div>
                  {onlineStatusMap && (
                    <StatusDot isOnline={onlineStatusMap[memberId] ?? false} size="sm" />
                  )}
                </div>
                <div className={styles.memberListInfo}>
                  <span className={styles.memberListName}>
                    {displayName}
                    {isCurrentUser && <span className={styles.memberYouLabel}>(あなた)</span>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {chatRoom.type === 'group' && onLeave && (
          <button
            className={styles.reactionRemoveButton}
            onClick={onLeave}
            style={{ width: '100%', marginTop: '16px' }}
          >
            グループを退出
          </button>
        )}
        <button
          className={styles.groupEditCancelButton}
          onClick={onClose}
          style={{ width: '100%', marginTop: chatRoom.type === 'group' && onLeave ? '8px' : '16px' }}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
