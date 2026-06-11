// 「常に手前に表示」（Electron 専用）の状態とトグル。Home.tsx から機械的に移動（挙動変更なし）。

import { useEffect, useState } from 'react';
import { isElectronEnv } from './useElectronNotification';

export function useAlwaysOnTop() {
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);

  // 常に手前に表示の初期値を取得（Electron環境のみ）
  useEffect(() => {
    if (isElectronEnv() && window.electronAPI?.getAlwaysOnTop) {
      window.electronAPI.getAlwaysOnTop().then(setAlwaysOnTop);
    }
  }, []);

  // 常に手前に表示をトグル
  async function toggleAlwaysOnTop() {
    if (!isElectronEnv() || !window.electronAPI?.setAlwaysOnTop) return;
    const newValue = !alwaysOnTop;
    const success = await window.electronAPI.setAlwaysOnTop(newValue);
    if (success) {
      setAlwaysOnTop(newValue);
    }
  }

  return { alwaysOnTop, toggleAlwaysOnTop };
}
