import { useState } from 'react';
import styles from '../../../pages/Home.module.css';
import useModal from '../../../hooks/useModal';
import type { NotificationDiagnostics, DiagnosticStatus } from '../../../hooks/useNotificationDiagnostics';
import { useToast } from '../../../contexts/ToastContext';

interface NotificationSettings {
  enableNotifications: boolean;
  showMessageContent: boolean;
  notifyActiveRoom: boolean;
}

interface MutedRoom {
  id: string;
  name: string;
}

interface NotificationSettingsModalProps {
  isOpen: boolean;
  settings: NotificationSettings;
  isElectron: boolean;
  diagnostics: NotificationDiagnostics;
  diagnosticsLoading: boolean;
  /** M-17: ミュート中のルーム一覧 */
  mutedRooms?: MutedRoom[];
  onClose: () => void;
  onUpdateSettings: (settings: NotificationSettings) => void;
  onRefreshDiagnostics: () => Promise<void> | void;
  onRequestPermission: () => Promise<'granted' | 'denied' | 'default' | 'unsupported'>;
  /** M-17: ミュート解除ハンドラ */
  onUnmuteRoom?: (roomId: string) => Promise<void> | void;
}

function statusLabel(status: DiagnosticStatus): { label: string; tone: 'ok' | 'warn' | 'error' | 'pending' } {
  switch (status) {
    case 'ok':
      return { label: '有効', tone: 'ok' };
    case 'pending':
      return { label: '未取得', tone: 'pending' };
    case 'denied':
      return { label: '拒否', tone: 'error' };
    case 'unsupported':
      return { label: '非対応', tone: 'error' };
    case 'error':
      return { label: 'エラー', tone: 'error' };
    default:
      return { label: '不明', tone: 'warn' };
  }
}

export default function NotificationSettingsModal({
  isOpen,
  settings,
  isElectron,
  diagnostics,
  diagnosticsLoading,
  mutedRooms = [],
  onClose,
  onUpdateSettings,
  onRefreshDiagnostics,
  onRequestPermission,
  onUnmuteRoom,
}: NotificationSettingsModalProps) {
  const { modalProps } = useModal({ isOpen, onClose });
  const { showToast } = useToast();
  const [requesting, setRequesting] = useState(false);
  const [showDeniedHelp, setShowDeniedHelp] = useState(false);

  if (!isOpen) return null;

  const handleRequestPermission = async () => {
    setRequesting(true);
    try {
      const result = await onRequestPermission();
      if (result === 'granted') {
        showToast('success', '通知が有効になりました');
        setShowDeniedHelp(false);
      } else if (result === 'denied') {
        showToast('warning', '通知が拒否されました。ブラウザ設定で許可してください。');
        setShowDeniedHelp(true);
      } else if (result === 'unsupported') {
        showToast('warning', 'このブラウザは通知に対応していません');
      } else {
        showToast('warning', '通知許可は変更されませんでした');
      }
      await onRefreshDiagnostics();
    } finally {
      setRequesting(false);
    }
  };

  const handleTestNotification = async () => {
    if (isElectron && window.electronAPI) {
      await window.electronAPI.showNotification({
        title: 'ArticsChat 通知テスト',
        body: 'これは通知のテストです。',
      });
      showToast('success', 'テスト通知を送信しました');
      return;
    }
    if (!('Notification' in window)) {
      showToast('warning', 'このブラウザは通知に対応していません');
      return;
    }
    if (Notification.permission !== 'granted') {
      showToast('warning', '通知許可が必要です。まず「通知を有効にする」を実行してください。');
      return;
    }
    try {
      const n = new Notification('ArticsChat 通知テスト', {
        body: 'これは通知のテストです。',
        icon: '/favicon.png',
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      showToast('success', 'テスト通知を送信しました');
    } catch (err) {
      console.error('[Notification Test] error:', err);
      showToast('error', 'テスト通知の送信に失敗しました');
    }
  };

  const permission = statusLabel(diagnostics.permission);
  const token = statusLabel(diagnostics.fcmToken);
  const sw = statusLabel(diagnostics.serviceWorker);

  const allOk =
    diagnostics.permission === 'ok' &&
    diagnostics.fcmToken === 'ok' &&
    diagnostics.serviceWorker === 'ok';

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={onClose}
      aria-labelledby="notification-settings-modal-title"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="notification-settings-modal-title">通知設定</h2>

        {/* H-10/M-31: 通知ステータスセクション */}
        {!isElectron && (
          <section
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              padding: 12,
              margin: '0 0 16px',
              background: 'var(--bg-secondary)',
            }}
            aria-label="通知の状態"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>通知の状態</strong>
              <button
                type="button"
                onClick={onRefreshDiagnostics}
                disabled={diagnosticsLoading}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: 4,
                  padding: '2px 8px',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
              >
                {diagnosticsLoading ? '更新中...' : '再確認'}
              </button>
            </div>

            <DiagnosticRow label="ブラウザ通知許可" status={permission} />
            <DiagnosticRow label="FCM トークン" status={token} />
            <DiagnosticRow label="Service Worker" status={sw} />

            {/* H-9: 通知を有効にするボタン */}
            {diagnostics.permission !== 'ok' && diagnostics.permission !== 'unsupported' && (
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={handleRequestPermission}
                  disabled={requesting}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--accent-color, #1a73e8)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: requesting ? 'wait' : 'pointer',
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  {requesting ? '確認中...' : '通知を有効にする'}
                </button>
              </div>
            )}

            {/* 拒否時のブラウザ設定誘導 */}
            {(showDeniedHelp || diagnostics.permission === 'denied') && (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  background: 'var(--bg-tertiary, #fff3cd)',
                  borderRadius: 6,
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: 'var(--text-secondary)',
                }}
              >
                <strong>通知が拒否されています</strong>
                <br />
                ブラウザのアドレスバー左端の鍵アイコン → 「通知」を「許可」に変更してください。
                <br />
                変更後、このページを再読み込みしてから「再確認」を押してください。
              </div>
            )}

            {/* 通知テストボタン */}
            {allOk && (
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={handleTestNotification}
                  style={{
                    width: '100%',
                    padding: '6px 12px',
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--text-primary)',
                  }}
                >
                  通知をテスト
                </button>
              </div>
            )}
          </section>
        )}

        <div className={styles.notificationSettings}>
          {/* 通知の有効/無効 */}
          <div className={styles.notificationOption}>
            <div className={styles.notificationOptionText}>
              <span className={styles.notificationOptionLabel}>通知を表示</span>
              <span className={styles.notificationOptionDescription}>
                新しいメッセージの通知を受け取ります
              </span>
            </div>
            <label className={styles.toggleSwitch} aria-label="通知を表示">
              <input
                type="checkbox"
                checked={settings.enableNotifications}
                onChange={(e) => {
                  onUpdateSettings({
                    ...settings,
                    enableNotifications: e.target.checked,
                  });
                }}
              />
              <span className={styles.toggleSlider}></span>
            </label>
          </div>

          {/* メッセージ内容の表示 */}
          <div className={styles.notificationOption}>
            <div className={styles.notificationOptionText}>
              <span className={styles.notificationOptionLabel}>メッセージ内容を表示</span>
              <span className={styles.notificationOptionDescription}>
                通知にメッセージ内容を表示します（OFFで「メッセージが届きました」と表示）
              </span>
            </div>
            <label className={styles.toggleSwitch} aria-label="メッセージ内容を表示">
              <input
                type="checkbox"
                checked={settings.showMessageContent}
                disabled={!settings.enableNotifications}
                onChange={(e) => {
                  onUpdateSettings({
                    ...settings,
                    showMessageContent: e.target.checked,
                  });
                }}
              />
              <span className={styles.toggleSlider}></span>
            </label>
          </div>

          {/* すべてのメッセージを通知（Electron専用） */}
          {isElectron && (
            <div className={styles.notificationOption}>
              <div className={styles.notificationOptionText}>
                <span className={styles.notificationOptionLabel}>すべてのメッセージを通知</span>
                <span className={styles.notificationOptionDescription}>
                  閲覧中のルームを含め、すべての新着メッセージを通知します
                </span>
              </div>
              <label className={styles.toggleSwitch} aria-label="すべてのメッセージを通知">
                <input
                  type="checkbox"
                  checked={settings.notifyActiveRoom}
                  disabled={!settings.enableNotifications}
                  onChange={(e) => {
                    onUpdateSettings({
                      ...settings,
                      notifyActiveRoom: e.target.checked,
                    });
                  }}
                />
                <span className={styles.toggleSlider}></span>
              </label>
            </div>
          )}
        </div>

        {/* M-17: ミュート中のルーム一覧 */}
        {mutedRooms.length > 0 && (
          <section
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              padding: 12,
              margin: '12px 0 0',
              background: 'var(--bg-secondary)',
            }}
            aria-label="ミュート中のルーム"
          >
            <strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
              ミュート中のルーム ({mutedRooms.length})
            </strong>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {mutedRooms.map((room) => (
                <li
                  key={room.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: '1px solid var(--border-light)',
                    fontSize: 13,
                  }}
                >
                  <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {room.name}
                  </span>
                  {onUnmuteRoom && (
                    <button
                      type="button"
                      onClick={() => void onUnmuteRoom(room.id)}
                      style={{
                        background: 'transparent',
                        border: '1px solid #1a73e8',
                        color: '#1a73e8',
                        borderRadius: 4,
                        padding: '4px 10px',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      解除
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <button className={styles.closeButton} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}

function DiagnosticRow({
  label,
  status,
}: {
  label: string;
  status: { label: string; tone: 'ok' | 'warn' | 'error' | 'pending' };
}) {
  const toneColor =
    status.tone === 'ok'
      ? '#14b8a6'
      : status.tone === 'error'
        ? '#ef4444'
        : status.tone === 'warn'
          ? '#f59e0b'
          : '#9ca3af';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 0',
        fontSize: 13,
        color: 'var(--text-secondary)',
      }}
    >
      <span>{label}</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontWeight: 500,
          color: toneColor,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: toneColor,
            display: 'inline-block',
          }}
        />
        {status.label}
      </span>
    </div>
  );
}
