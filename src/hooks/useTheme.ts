// テーマ（ライト/ダーク）の状態と切り替え。Home.tsx から機械的に移動（挙動変更なし）。

import { useEffect, useState } from 'react';

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved === 'dark') ? 'dark' : 'light';
  });

  // テーマ切り替え
  function toggleTheme(newTheme: 'light' | 'dark') {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    // Electron環境ではWindowsのタイトルバー（ネイティブ枠）の明暗も連動させる
    window.electronAPI?.setTitleBarTheme?.(newTheme);
  }

  // 初期テーマ設定（マウント時に localStorage の値を一度だけ適用）
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { theme, toggleTheme };
}
