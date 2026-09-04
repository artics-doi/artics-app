import { useRef } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../../../lib/firebase';
import { useToast } from '../../../contexts/ToastContext';
import useModal from '../../../hooks/useModal';
import type { ChatRoom } from '../../../types';
import { handleGroupImageChange as convertGroupImageToBase64 } from '../../../utils/image';
import styles from '../../../pages/Chat.module.css';

interface GroupEditModalProps {
  isOpen: boolean;
  roomId: string;
  chatRoom: ChatRoom;
  editGroupName: string;
  editGroupImage: string | null;
  savingGroup: boolean;
  onEditGroupNameChange: (name: string) => void;
  onEditGroupImageChange: (image: string | null) => void;
  onSavingGroupChange: (saving: boolean) => void;
  onClose: () => void;
  onSaved: (updated: { name: string; photoURL: string | null }) => void;
}

export default function GroupEditModal({
  isOpen,
  roomId,
  chatRoom,
  editGroupName,
  editGroupImage,
  savingGroup,
  onEditGroupNameChange,
  onEditGroupImageChange,
  onSavingGroupChange,
  onClose,
  onSaved
}: GroupEditModalProps) {
  const { showToast } = useToast();
  const { modalProps } = useModal({ isOpen, onClose });
  const groupImageInputRef = useRef<HTMLInputElement>(null);

  async function handleGroupImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imageData = await convertGroupImageToBase64(file);
      onEditGroupImageChange(imageData);
    } catch (error) {
      console.error('グループ画像変換エラー:', error);
      showToast('error', '画像の読み込みに失敗しました');
    }
  }

  async function saveGroupEdit() {
    if (!editGroupName.trim()) return;

    onSavingGroupChange(true);
    try {
      let photoURL = chatRoom.photoURL ?? null;
      let photoStoragePath = chatRoom.photoStoragePath ?? null;
      let photoFileSize = chatRoom.photoFileSize ?? null;

      if (editGroupImage && editGroupImage.startsWith('data:')) {
        const response = await fetch(editGroupImage);
        const blob = await response.blob();
        const timestamp = Date.now();
        photoStoragePath = `groupImages/${roomId}/group_${timestamp}`;
        photoFileSize = blob.size;
        const storageRef = ref(storage, photoStoragePath);
        await uploadBytes(storageRef, blob, {
          cacheControl: 'public, max-age=604800',
          contentType: blob.type || 'image/jpeg',
        });
        photoURL = await getDownloadURL(storageRef);
      }

      const trimmedName = editGroupName.trim();
      await updateDoc(doc(db, 'chatRooms', roomId), {
        name: trimmedName,
        photoURL,
        photoStoragePath,
        photoFileSize,
        updatedAt: serverTimestamp()
      });

      onEditGroupImageChange(photoURL);
      onSaved({ name: trimmedName, photoURL });
    } catch (error) {
      console.error('グループ編集エラー:', error);
      showToast('error', 'グループ情報の更新に失敗しました');
    } finally {
      onSavingGroupChange(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      {...modalProps}
      className={styles.groupEditOverlay}
      onClick={onClose}
      aria-labelledby="group-edit-modal-title"
    >
      <div className={styles.groupEditModal} onClick={(e) => e.stopPropagation()}>
        <h2 id="group-edit-modal-title" className={styles.groupEditTitle}>グループを編集</h2>

        <div className={styles.groupEditImageSection}>
          <input
            type="file"
            ref={groupImageInputRef}
            onChange={handleGroupImageChange}
            accept="image/*"
            style={{ display: 'none' }}
          />
          <div
            className={styles.groupEditImagePreview}
            onClick={() => groupImageInputRef.current?.click()}
          >
            {editGroupImage ? (
              <img src={editGroupImage} alt="グループ画像" />
            ) : (
              <span className={styles.groupEditImagePlaceholder}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </span>
            )}
            <div className={styles.groupEditImageOverlay}>
              <span>変更</span>
            </div>
          </div>
          <p className={styles.groupEditImageHint}>タップして画像を変更</p>
        </div>

        <div className={styles.groupEditNameSection}>
          <label htmlFor="group-edit-name-input">グループ名</label>
          <input
            id="group-edit-name-input"
            type="text"
            value={editGroupName}
            onChange={(e) => onEditGroupNameChange(e.target.value)}
            placeholder="グループ名を入力"
            className={styles.groupEditNameInput}
          />
        </div>

        <div className={styles.groupEditButtons}>
          <button
            className={styles.groupEditSaveButton}
            onClick={saveGroupEdit}
            disabled={savingGroup || !editGroupName.trim()}
          >
            {savingGroup ? '保存中...' : '保存'}
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
