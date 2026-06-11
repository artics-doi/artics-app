import styles from '../../../pages/Home.module.css';
import useModal from '../../../hooks/useModal';

interface DeleteRoomConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDelete: () => void;
  /** M-15: ルーム種別と削除モードに応じて文言を変える */
  roomType?: 'direct' | 'group' | 'memo';
  /** 'delete': ルーム削除 / 'leave': グループ退出 */
  mode?: 'delete' | 'leave';
  /** M-16: 削除実行中（spinner + disabled） */
  isDeleting?: boolean;
  /** 対象ルーム名（メッセージ強調用） */
  roomName?: string;
}

export default function DeleteRoomConfirmModal({
  isOpen,
  onClose,
  onDelete,
  roomType = 'direct',
  mode = 'delete',
  isDeleting = false,
  roomName,
}: DeleteRoomConfirmModalProps) {
  const { modalProps } = useModal({ isOpen, onClose: isDeleting ? () => {} : onClose });

  if (!isOpen) return null;

  // M-15: タイトル / 説明 / ボタン文言を分岐
  const { title, description, confirmLabel } = (() => {
    if (mode === 'leave') {
      return {
        title: 'グループから退出',
        description: `${roomName ? `「${roomName}」` : 'このグループ'} から退出します。再度招待されない限り、新しいメッセージは受け取れません。`,
        confirmLabel: '退出する',
      };
    }
    if (roomType === 'group') {
      return {
        title: 'グループを削除',
        description: `${roomName ? `「${roomName}」` : 'このグループ'} を完全に削除します。すべてのメッセージとメンバー情報が失われ、元に戻せません。`,
        confirmLabel: '削除',
      };
    }
    if (roomType === 'memo') {
      return {
        title: 'メモルームを削除',
        description: 'メモルームを削除します。すべてのメモが失われ、元に戻せません。',
        confirmLabel: '削除',
      };
    }
    return {
      title: 'チャットルームを削除',
      description: 'このチャットルームを削除しますか？すべてのメッセージが削除され、元に戻すことはできません。',
      confirmLabel: '削除',
    };
  })();

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={isDeleting ? undefined : onClose}
      aria-labelledby="delete-room-modal-title"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="delete-room-modal-title">{title}</h2>
        <p className={styles.deleteWarning}>{description}</p>
        <div className={styles.modalActions}>
          <button
            className={styles.deleteConfirmButton}
            onClick={onDelete}
            disabled={isDeleting}
            aria-busy={isDeleting}
          >
            {isDeleting ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }} aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                実行中…
              </span>
            ) : (
              confirmLabel
            )}
          </button>
          <button className={styles.closeButton} onClick={onClose} disabled={isDeleting}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
