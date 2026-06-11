// PWA更新通知コンポーネント
import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './PWAUpdatePrompt.module.css';

// @ts-expect-error __APP_VERSION__ is defined in vite.config.ts
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
const UPDATED_VERSION_KEY = 'pwa_updated_version';

function PWAUpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const hasShownRef = useRef(false);

  // Service Workerの更新をチェック
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    // 既に更新済みのバージョンかチェック
    const updatedVersion = localStorage.getItem(UPDATED_VERSION_KEY);
    if (updatedVersion === APP_VERSION) {
      // 現在のバージョンで既に更新済み - ダイアログを表示しない
      return;
    }

    let intervalId: ReturnType<typeof setInterval>;

    const registerAndCheck = async () => {
      try {
        // 既存のService Worker登録を取得
        const reg = await navigator.serviceWorker.ready;

        // 新しいService Workerが待機中かチェック
        if (reg.waiting && !hasShownRef.current) {
          hasShownRef.current = true;
          setShowPrompt(true);
        }

        // updatefoundイベントをリッスン
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller && !hasShownRef.current) {
                // 新しいバージョンが利用可能
                hasShownRef.current = true;
                setShowPrompt(true);
              }
            });
          }
        });

        // 定期的に更新をチェック（1時間ごと）
        intervalId = setInterval(() => {
          reg.update().catch(console.error);
        }, 60 * 60 * 1000);

        // 初回チェック
        reg.update().catch(console.error);

      } catch (error) {
        console.error('[PWA] Service Worker registration error:', error);
      }
    };

    registerAndCheck();

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  const handleUpdate = useCallback(async () => {
    try {
      // 更新完了フラグを保存（リロード後に同じダイアログが出ないように）
      localStorage.setItem(UPDATED_VERSION_KEY, APP_VERSION);

      // Service Workerのキャッシュをすべて削除
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));

      // Service Workerを登録解除
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));

      // 強制リロード
      window.location.reload();
    } catch (error) {
      console.error('Update error:', error);
      // エラーが発生しても強制リロード
      window.location.reload();
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setShowPrompt(false);
  }, []);

  if (!showPrompt) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.icon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <h2 className={styles.title}>アップデートがあります</h2>
        <p className={styles.message}>
          新しいバージョンが利用可能です。<br />
          今すぐ更新しますか？
        </p>
        <div className={styles.buttons}>
          <button className={styles.laterButton} onClick={handleDismiss}>
            後で
          </button>
          <button className={styles.updateButton} onClick={handleUpdate}>
            今すぐ更新
          </button>
        </div>
      </div>
    </div>
  );
}

export default PWAUpdatePrompt;
