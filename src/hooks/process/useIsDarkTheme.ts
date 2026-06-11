import { useEffect, useState } from 'react';

// data-theme 属性を監視してダークテーマかどうかを返す。
// Board / Gantt のガント配色切替で使用（テーマ切替に即時追従する MutationObserver 版）。
export function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
