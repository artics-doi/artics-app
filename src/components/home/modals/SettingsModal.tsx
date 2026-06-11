import styles from '../../../pages/Home.module.css';
import { isElectronEnv } from '../../../hooks/useElectronNotification';
import useModal from '../../../hooks/useModal';

interface SettingsModalProps {
  isOpen: boolean;
  appVersion: string;
  updateStatus: 'idle' | 'checking' | 'available' | 'latest' | 'error';
  alwaysOnTop: boolean;
  currentUserName?: string | null;
  currentUserEmail?: string | null;
  currentUserPhotoURL?: string | null;
  onToggleAlwaysOnTop: () => void;
  onClose: () => void;
  onProfileEdit: () => void;
  onTheme: () => void;
  onNotificationSettings: () => void;
  onReleaseNotes: () => void;
  onCheckForUpdates: () => void;
  onLogout: () => void;
  onTitleClick: () => void;
}

export default function SettingsModal({
  isOpen,
  appVersion,
  updateStatus,
  alwaysOnTop,
  currentUserName,
  currentUserEmail,
  currentUserPhotoURL,
  onToggleAlwaysOnTop,
  onClose,
  onProfileEdit,
  onTheme,
  onNotificationSettings,
  onReleaseNotes,
  onCheckForUpdates,
  onLogout,
  onTitleClick
}: SettingsModalProps) {
  const { modalProps } = useModal({ isOpen, onClose });

  if (!isOpen) return null;

  const isElectron = isElectronEnv();
  const profileName = currentUserName?.trim() || '名前未設定';
  const profileEmail = currentUserEmail?.trim() || 'メール未設定';
  const profileInitial = Array.from(profileName)[0] || 'A';

  const handleForceReload = async () => {
    if (confirm('キャッシュをクリアしてアプリを再読み込みしますか？')) {
      try {
        // Service Workerのキャッシュをすべて削除
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        // Service Workerを登録解除
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
        // 強制リロード（キャッシュを無視）
        window.location.reload();
      } catch (error) {
        console.error('強制リロードエラー:', error);
        window.location.reload();
      }
    }
  };

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={onClose}
      aria-labelledby="settings-modal-title"
    >
      <div className={`${styles.modalContent} ${styles.settingsModalContent}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.settingsHeader}>
          <div>
            <span className={styles.settingsEyebrow}>Account settings</span>
            <h2 id="settings-modal-title" onClick={onTitleClick}>設定</h2>
          </div>
          <button type="button" className={styles.settingsCloseIcon} onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        <button type="button" className={styles.settingsProfileCard} onClick={onProfileEdit}>
          <span className={styles.settingsProfileAvatar}>
            {currentUserPhotoURL ? (
              <img src={currentUserPhotoURL} alt="" />
            ) : (
              <span>{profileInitial}</span>
            )}
          </span>
          <span className={styles.settingsProfileText}>
            <strong>{profileName}</strong>
            <small>{profileEmail}</small>
          </span>
          <span className={styles.settingsProfileAction}>編集</span>
        </button>

        <div className={styles.settingsSection}>
          <h3>表示と通知</h3>
          <button type="button" className={styles.settingsMenuItem} onClick={onTheme}>
            <span className={`${styles.settingsItemIcon} ${styles.settingsIconTheme}`} aria-hidden="true" />
            <span className={styles.menuText}>
              <strong>テーマ</strong>
              <small>画面の明るさを切り替えます</small>
            </span>
            <span className={styles.menuArrow}>›</span>
          </button>
          <button type="button" className={styles.settingsMenuItem} onClick={onNotificationSettings}>
            <span className={`${styles.settingsItemIcon} ${styles.settingsIconNotification}`} aria-hidden="true" />
            <span className={styles.menuText}>
              <strong>通知設定</strong>
              <small>通知方法と表示内容を管理します</small>
            </span>
            <span className={styles.menuArrow}>›</span>
          </button>
          {isElectron && (
            <div className={styles.settingsMenuToggle}>
              <span className={`${styles.settingsItemIcon} ${styles.settingsIconPin}`} aria-hidden="true" />
              <span className={styles.menuText}>
                <strong>常に手前に表示</strong>
                <small>{alwaysOnTop ? '有効' : '無効'}</small>
              </span>
              <label className={styles.toggleSwitch} aria-label="常に手前に表示">
                <input
                  type="checkbox"
                  checked={alwaysOnTop}
                  onChange={onToggleAlwaysOnTop}
                />
                <span className={styles.toggleSlider}></span>
              </label>
            </div>
          )}
        </div>

        <div className={styles.settingsSection}>
          <h3>アプリ情報</h3>
          <button type="button" className={styles.settingsMenuItem} onClick={onReleaseNotes}>
            <span className={`${styles.settingsItemIcon} ${styles.settingsIconNote}`} aria-hidden="true" />
            <span className={styles.menuText}>
              <strong>更新ノート</strong>
              <small>最近の変更を確認します</small>
            </span>
            <span className={styles.menuArrow}>›</span>
          </button>
          {!isElectron && (
            <button type="button" className={styles.settingsMenuItem} onClick={handleForceReload}>
              <span className={`${styles.settingsItemIcon} ${styles.settingsIconRefresh}`} aria-hidden="true" />
              <span className={styles.menuText}>
                <strong>強制リロード</strong>
                <small>キャッシュをクリアして再読み込みします</small>
              </span>
              <span className={styles.menuArrow}>›</span>
            </button>
          )}
          {appVersion && (
            <div className={styles.versionSection}>
              <div className={styles.versionInfo}>
                <span className={styles.versionLabel}>現在のバージョン</span>
                <span className={styles.versionNumber}>v{appVersion}</span>
              </div>
              {isElectron && (
                <>
                  <button
                    type="button"
                    className={styles.updateButton}
                    onClick={onCheckForUpdates}
                    disabled={updateStatus === 'checking'}
                  >
                    {updateStatus === 'checking' ? '確認中...' : 'アップデートを確認'}
                  </button>
                  {updateStatus === 'available' && (
                    <p className={styles.updateMessage}>最新バージョンがあります。アプリを再起動してください。</p>
                  )}
                  {updateStatus === 'latest' && (
                    <p className={styles.updateMessageSuccess}>最新バージョンです。</p>
                  )}
                  {updateStatus === 'error' && (
                    <p className={styles.updateMessageError}>アップデートの確認に失敗しました。</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className={`${styles.settingsSection} ${styles.settingsDangerSection}`}>
          <h3>アカウント操作</h3>
          <button type="button" className={styles.settingsMenuItemLogout} onClick={onLogout}>
            <span className={`${styles.settingsItemIcon} ${styles.settingsIconLogout}`} aria-hidden="true" />
            <span className={styles.menuText}>
              <strong>ログアウト</strong>
              <small>この端末からサインアウトします</small>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
