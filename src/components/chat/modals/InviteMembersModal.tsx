// メンバー招待モーダル。Chat.tsx のインライン実装から機械的に移動（挙動変更なし）。
// スタイルは親ページの Chat.module.css をそのまま使う（GroupEditModal と同じ方式）。

import type { User } from '../../../types';
import styles from '../../../pages/Chat.module.css';

interface InviteMembersModalProps {
  invitableUsers: User[];
  inviteSelectedUsers: string[];
  setInviteSelectedUsers: (userIds: string[]) => void;
  onInvite: () => void;
  onClose: () => void;
}

export default function InviteMembersModal({
  invitableUsers,
  inviteSelectedUsers,
  setInviteSelectedUsers,
  onInvite,
  onClose,
}: InviteMembersModalProps) {
  return (
    <div className={styles.groupEditOverlay} onClick={onClose}>
      <div className={styles.groupEditModal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.groupEditTitle}>メンバーを招待</h2>
        <div className={styles.inviteUserList}>
          {invitableUsers.length === 0 ? (
            <p className={styles.noInvitableUsers}>招待可能なユーザーがいません</p>
          ) : (
            invitableUsers.map((user) => (
              <div
                key={user.uid}
                className={`${styles.inviteUserItem} ${inviteSelectedUsers.includes(user.uid) ? styles.selected : ''}`}
                onClick={() => {
                  if (inviteSelectedUsers.includes(user.uid)) {
                    setInviteSelectedUsers(inviteSelectedUsers.filter(id => id !== user.uid));
                  } else {
                    setInviteSelectedUsers([...inviteSelectedUsers, user.uid]);
                  }
                }}
              >
                <span className={styles.inviteUserAvatar}></span>
                <span className={styles.inviteUserName}>{user.displayName}</span>
                {inviteSelectedUsers.includes(user.uid) && <span className={styles.checkmark}>✓</span>}
              </div>
            ))
          )}
        </div>
        <div className={styles.groupEditButtons}>
          <button
            className={styles.groupEditSaveButton}
            onClick={onInvite}
            disabled={inviteSelectedUsers.length === 0}
          >
            招待
          </button>
          <button
            className={styles.groupEditCancelButton}
            onClick={onClose}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
