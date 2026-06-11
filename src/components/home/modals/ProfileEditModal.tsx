import { useRef } from 'react';
import styles from '../../../pages/Home.module.css';
import useModal from '../../../hooks/useModal';

interface ProfileEditModalProps {
  isOpen: boolean;
  profileName: string;
  profileImage: string | null;
  savingProfile: boolean;
  currentUserEmail: string | null | undefined;
  onClose: () => void;
  onProfileNameChange: (name: string) => void;
  onProfileImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
}

export default function ProfileEditModal({
  isOpen,
  profileName,
  profileImage,
  savingProfile,
  currentUserEmail,
  onClose,
  onProfileNameChange,
  onProfileImageChange,
  onSave
}: ProfileEditModalProps) {
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const { modalProps } = useModal({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={onClose}
      aria-labelledby="profile-edit-modal-title"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="profile-edit-modal-title">プロフィール編集</h2>

        <div className={styles.profileEditSection}>
          <div className={styles.profileImageEdit}>
            <input
              type="file"
              ref={profileImageInputRef}
              onChange={onProfileImageChange}
              accept="image/*"
              style={{ display: 'none' }}
            />
            <div
              className={styles.profileImagePreview}
              onClick={() => profileImageInputRef.current?.click()}
            >
              {profileImage ? (
                <img src={profileImage} alt="プロフィール" />
              ) : (
                <span className={styles.profileImagePlaceholder}></span>
              )}
              <div className={styles.profileImageOverlay}>
                <span>変更</span>
              </div>
            </div>
            <p className={styles.profileImageHint}>タップして画像を変更</p>
          </div>

          <div className={styles.profileNameEdit}>
            <label htmlFor="profile-display-name">表示名</label>
            <input
              id="profile-display-name"
              type="text"
              value={profileName}
              onChange={(e) => onProfileNameChange(e.target.value)}
              placeholder="名前を入力"
              className={styles.profileNameInput}
            />
          </div>

          <p className={styles.profileEmail}>{currentUserEmail}</p>
        </div>

        <div className={styles.modalActions}>
          <button
            className={styles.createButton}
            onClick={onSave}
            disabled={savingProfile || !profileName.trim()}
          >
            {savingProfile ? '保存中...' : '保存'}
          </button>
          <button className={styles.closeButton} onClick={onClose}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
