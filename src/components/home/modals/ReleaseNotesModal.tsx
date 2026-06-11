import styles from '../../../pages/Home.module.css';
import useModal from '../../../hooks/useModal';

interface ReleaseNotesModalProps {
  isOpen: boolean;
  releaseNotes: string;
  onClose: () => void;
}

export default function ReleaseNotesModal({
  isOpen,
  releaseNotes,
  onClose
}: ReleaseNotesModalProps) {
  const { modalProps } = useModal({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={onClose}
      aria-labelledby="release-notes-modal-title"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="release-notes-modal-title">更新ノート</h2>
        <div className={styles.releaseNotesContent}>
          {releaseNotes ? (
            <pre className={styles.releaseNotesText}>{releaseNotes}</pre>
          ) : (
            <p className={styles.noReleaseNotes}>更新ノートはありません</p>
          )}
        </div>
        <button className={styles.closeButton} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
