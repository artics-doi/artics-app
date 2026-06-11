import styles from '../../../pages/Home.module.css';
import useModal from '../../../hooks/useModal';

interface ThemeModalProps {
  isOpen: boolean;
  theme: 'light' | 'dark';
  onClose: () => void;
  onToggleTheme: (theme: 'light' | 'dark') => void;
}

export default function ThemeModal({
  isOpen,
  theme,
  onClose,
  onToggleTheme
}: ThemeModalProps) {
  const { modalProps } = useModal({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={onClose}
      aria-labelledby="theme-modal-title"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="theme-modal-title">テーマ設定</h2>

        <div className={styles.themeOptions}>
          <button
            className={`${styles.themeOptionButton} ${theme === 'light' ? styles.active : ''}`}
            onClick={() => onToggleTheme('light')}
          >
            <span className={styles.themeName}>ライトモード</span>
            {theme === 'light' && <span className={styles.themeCheck}>✓</span>}
          </button>
          <button
            className={`${styles.themeOptionButton} ${theme === 'dark' ? styles.active : ''}`}
            onClick={() => onToggleTheme('dark')}
          >
            <span className={styles.themeName}>ダークモード</span>
            {theme === 'dark' && <span className={styles.themeCheck}>✓</span>}
          </button>
        </div>

        <button className={styles.closeButton} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
