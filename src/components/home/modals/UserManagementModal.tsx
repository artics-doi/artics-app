import styles from '../../../pages/Home.module.css';
import type { User } from '../../../types';
import useModal from '../../../hooks/useModal';

interface UserManagementModalProps {
  isOpen: boolean;
  users: User[];
  onClose: () => void;
  onEditUser: (user: User) => void;
  onDeleteUser: (user: User) => void;
}

export default function UserManagementModal({
  isOpen,
  users,
  onClose,
  onEditUser,
  onDeleteUser
}: UserManagementModalProps) {
  const { modalProps } = useModal({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={onClose}
      aria-labelledby="user-management-modal-title"
    >
      <div className={styles.usersModalContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="user-management-modal-title">ユーザー管理</h2>
        <p className={styles.userManagementNote}>
          ユーザーの表示名を編集、またはFirestoreからユーザーを削除できます
        </p>
        {users.length === 0 ? (
          <p className={styles.noUsers}>他のユーザーがいません</p>
        ) : (
          <div className={styles.userManagementList}>
            {users.map((user) => (
              <div key={user.uid} className={styles.userManagementItem}>
                <div className={styles.userManagementInfo}>
                  <div className={styles.userListAvatar}>
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className={styles.userListAvatarImage} />
                    ) : null}
                  </div>
                  <div className={styles.userManagementDetails}>
                    <span className={styles.userManagementName}>{user.displayName}</span>
                    <span className={styles.userManagementEmail}>{user.email}</span>
                  </div>
                </div>
                <div className={styles.userManagementActions}>
                  <button
                    className={styles.userEditButton}
                    onClick={() => onEditUser(user)}
                    title="編集"
                  >
                    編集
                  </button>
                  <button
                    className={styles.userDeleteButton}
                    onClick={() => onDeleteUser(user)}
                    title="削除"
                  >
                    削除
                  </button>
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
