import styles from '../../../pages/Home.module.css';
import type { User } from '../../../types';
import useModal from '../../../hooks/useModal';
import { StatusDot } from '../../StatusDot';
import statusDotStyles from '../../StatusDot.module.css';

interface UsersListModalProps {
  isOpen: boolean;
  users: User[];
  onClose: () => void;
  onUserClick: (user: User) => void;
  onTitleClick: () => void;
  onlineStatusMap?: Record<string, boolean>;
}

export default function UsersListModal({
  isOpen,
  users,
  onClose,
  onUserClick,
  onTitleClick,
  onlineStatusMap
}: UsersListModalProps) {
  const { modalProps } = useModal({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={onClose}
      aria-labelledby="users-list-modal-title"
    >
      <div className={styles.usersModalContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="users-list-modal-title" onClick={onTitleClick} style={{ cursor: 'default' }}>ユーザー</h2>
        {users.length === 0 ? (
          <p className={styles.noUsers}>他のユーザーがいません</p>
        ) : (
          <div className={styles.usersModalList}>
            {users.map((user) => (
              <div
                key={user.uid}
                className={styles.userListItem}
                onClick={() => { onUserClick(user); onClose(); }}
              >
                <div className={statusDotStyles.avatarWrapper} style={{ marginRight: 12 }}>
                  <div className={styles.userListAvatar} style={{ marginRight: 0 }}>
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className={styles.userListAvatarImage} />
                    ) : null}
                  </div>
                  {onlineStatusMap && (
                    <StatusDot isOnline={onlineStatusMap[user.uid] ?? false} size="sm" />
                  )}
                </div>
                <div className={styles.userListInfo}>
                  <span className={styles.userListName}>{user.displayName}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <button className={styles.closeButton} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
