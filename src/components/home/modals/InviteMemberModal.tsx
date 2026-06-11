import styles from '../../../pages/Home.module.css';
import type { User } from '../../../types';
import useModal from '../../../hooks/useModal';

interface InviteMemberModalProps {
  isOpen: boolean;
  invitableUsers: User[];
  selectedUsers: string[];
  onClose: () => void;
  onSelectedUsersChange: (users: string[]) => void;
  onInvite: () => void;
}

export default function InviteMemberModal({
  isOpen,
  invitableUsers,
  selectedUsers,
  onClose,
  onSelectedUsersChange,
  onInvite
}: InviteMemberModalProps) {
  const { modalProps } = useModal({ isOpen, onClose });

  if (!isOpen) return null;

  const toggleUser = (uid: string) => {
    if (selectedUsers.includes(uid)) {
      onSelectedUsersChange(selectedUsers.filter(id => id !== uid));
    } else {
      onSelectedUsersChange([...selectedUsers, uid]);
    }
  };

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={onClose}
      aria-labelledby="invite-member-modal-title"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="invite-member-modal-title">メンバー招待</h2>
        <h3>招待するユーザーを選択</h3>
        <div className={styles.userList}>
          {invitableUsers.length === 0 ? (
            <p className={styles.noUsers}>招待可能なユーザーがいません</p>
          ) : (
            invitableUsers.map((user) => (
              <div
                key={user.uid}
                className={`${styles.userItem} ${selectedUsers.includes(user.uid) ? styles.selected : ''}`}
                onClick={() => toggleUser(user.uid)}
              >
                <span className={styles.userAvatar}></span>
                <span className={styles.userName}>{user.displayName}</span>
                {selectedUsers.includes(user.uid) && <span className={styles.checkmark}>✓</span>}
              </div>
            ))
          )}
        </div>
        <div className={styles.modalActions}>
          <button
            className={styles.createButton}
            onClick={onInvite}
            disabled={selectedUsers.length === 0}
          >
            招待
          </button>
          <button className={styles.closeButton} onClick={onClose}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
