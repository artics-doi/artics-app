import { useRef } from 'react';
import styles from '../../../pages/Home.module.css';
import type { User } from '../../../types';
import useModal from '../../../hooks/useModal';

interface NewGroupModalProps {
  isOpen: boolean;
  users: User[];
  selectedUsers: string[];
  groupName: string;
  groupImage: string | null;
  onClose: () => void;
  onSelectedUsersChange: (users: string[]) => void;
  onGroupNameChange: (name: string) => void;
  onGroupImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCreate: () => void;
}

export default function NewGroupModal({
  isOpen,
  users,
  selectedUsers,
  groupName,
  groupImage,
  onClose,
  onSelectedUsersChange,
  onGroupNameChange,
  onGroupImageChange,
  onCreate
}: NewGroupModalProps) {
  const groupImageInputRef = useRef<HTMLInputElement>(null);
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
      aria-labelledby="new-group-modal-title"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="new-group-modal-title">グループを作成</h2>

        {/* グループ画像選択 */}
        <div className={styles.groupImageSection}>
          <input
            type="file"
            ref={groupImageInputRef}
            onChange={onGroupImageChange}
            accept="image/*"
            style={{ display: 'none' }}
          />
          <div
            className={styles.groupImagePreview}
            onClick={() => groupImageInputRef.current?.click()}
          >
            {groupImage ? (
              <img src={groupImage} alt="グループ画像" />
            ) : (
              <span className={styles.groupImagePlaceholder}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </span>
            )}
            <div className={styles.groupImageOverlay}>
              <span>画像を選択</span>
            </div>
          </div>
          <p className={styles.groupImageHint}>タップして画像を設定（任意）</p>
        </div>

        <div className={styles.inputGroup}>
          <input
            type="text"
            placeholder="グループ名"
            value={groupName}
            onChange={(e) => onGroupNameChange(e.target.value)}
            className={styles.groupNameInput}
          />
          {!groupName.trim() && (
            <p className={styles.inputHint}>グループ名を入力してください</p>
          )}
        </div>
        <h3>メンバーを選択 {selectedUsers.length > 0 && `(${selectedUsers.length}人)`}</h3>

        {/* M-14: 選択中メンバーの chip 一覧 */}
        {selectedUsers.length > 0 && (
          <div className={styles.memberChipList} role="list" aria-label="選択中のメンバー">
            {selectedUsers.map((uid) => {
              const user = users.find((u) => u.uid === uid);
              if (!user) return null;
              return (
                <span key={uid} className={styles.memberChip} role="listitem">
                  <span className={styles.memberChipName}>{user.displayName}</span>
                  <button
                    type="button"
                    className={styles.memberChipRemove}
                    onClick={() => toggleUser(uid)}
                    aria-label={`${user.displayName} を選択から外す`}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div className={styles.userList}>
          {users.map((user) => (
            <button
              key={user.uid}
              type="button"
              className={`${styles.userItem} ${selectedUsers.includes(user.uid) ? styles.selected : ''}`}
              onClick={() => toggleUser(user.uid)}
              aria-pressed={selectedUsers.includes(user.uid)}
            >
              <span className={styles.userAvatar} aria-hidden="true"></span>
              <span className={styles.userName}>{user.displayName}</span>
              {selectedUsers.includes(user.uid) && <span className={styles.checkmark} aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
        <div className={styles.modalActions}>
          <button
            className={styles.createButton}
            onClick={onCreate}
            disabled={selectedUsers.length === 0 || !groupName.trim()}
          >
            作成
          </button>
          <button className={styles.closeButton} onClick={onClose}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
