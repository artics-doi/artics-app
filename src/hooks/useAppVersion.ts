// アプリバージョンの取得とアップデート確認。Home.tsx から機械的に移動（挙動変更なし）。
// Electron は IPC、PWA はビルド時に埋め込まれる __APP_VERSION__ から取得する。

import { useEffect, useState } from 'react';
import { isElectronEnv } from './useElectronNotification';

export function useAppVersion() {
  const [appVersion, setAppVersion] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'latest' | 'error'>('idle');

  // アプリバージョンを取得
  useEffect(() => {
    async function fetchAppVersion() {
      if (isElectronEnv() && window.electronAPI?.getAppVersion) {
        // Electron: IPCから取得
        const version = await window.electronAPI.getAppVersion();
        setAppVersion(version);
      } else {
        // PWA/ブラウザ: ビルド時にpackage.jsonのバージョンが埋め込まれる
        // @ts-expect-error __APP_VERSION__ is defined in vite.config.ts
        const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
        if (version) {
          setAppVersion(version);
        }
      }
    }
    fetchAppVersion();
  }, []);

  // アップデートを確認
  async function checkForUpdates() {
    if (!isElectronEnv() || !window.electronAPI?.checkForUpdates) return;

    setUpdateStatus('checking');
    try {
      const result = await window.electronAPI.checkForUpdates();
      if (result.isDev) {
        setUpdateStatus('latest');
      } else if (result.error) {
        setUpdateStatus('error');
      } else if (result.available) {
        setUpdateStatus('available');
      } else {
        setUpdateStatus('latest');
      }
    } catch {
      setUpdateStatus('error');
    }
  }

  return { appVersion, updateStatus, checkForUpdates };
}
