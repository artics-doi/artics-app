// M-36: PWA インストールバナー
// `beforeinstallprompt` イベントを捕捉してユーザーにインストールを提案する。
// - インストール済み / Electron 環境 / 7 日以内に却下した場合は表示しない

import { useEffect, useState } from 'react';
import styles from './PWAInstallBanner.module.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'artics:pwaInstallDismissedAt';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 日

function isElectronEnv(): boolean {
  return typeof window !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron');
}

function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  // standalone display: PWA としてインストール済み
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari の standalone プロパティ
  // @ts-expect-error iOS Safari only
  if (window.navigator.standalone === true) return true;
  return false;
}

function wasRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (isNaN(ts)) return false;
    return Date.now() - ts < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

export default function PWAInstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isElectronEnv() || isInstalled() || wasRecentlyDismissed()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // インストール完了で自動非表示
  useEffect(() => {
    const handler = () => {
      setVisible(false);
      setPromptEvent(null);
    };
    window.addEventListener('appinstalled', handler);
    return () => window.removeEventListener('appinstalled', handler);
  }, []);

  if (!visible || !promptEvent) return null;

  const handleInstall = async () => {
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      console.log('[PWAInstallBanner] outcome:', outcome);
      if (outcome === 'dismissed') {
        localStorage.setItem(DISMISS_KEY, Date.now().toString());
      }
    } catch (e) {
      console.error('[PWAInstallBanner] prompt failed:', e);
    } finally {
      setVisible(false);
      setPromptEvent(null);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setVisible(false);
    setPromptEvent(null);
  };

  return (
    <div className={styles.banner} role="region" aria-label="アプリのインストール提案">
      <div className={styles.content}>
        <div className={styles.icon} aria-hidden="true">📱</div>
        <div className={styles.text}>
          <div className={styles.title}>ArticsChat をインストール</div>
          <div className={styles.subtitle}>ホーム画面に追加して素早く起動できます</div>
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.installButton} onClick={handleInstall}>
          インストール
        </button>
        <button type="button" className={styles.dismissButton} onClick={handleDismiss} aria-label="閉じる">
          ×
        </button>
      </div>
    </div>
  );
}
