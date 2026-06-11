// 仮想キーボード表示時の高さ追従用 hook。
//
// `visualViewport` API を監視し、CSS カスタムプロパティ `--keyboard-height` を
// document.documentElement に設定する。`interactive-widget=resizes-content` を
// 併用しているため layout viewport は縮むが、念のため明示的に保険を入れる。

import { useEffect } from 'react';

export function useVisualViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const updateKeyboardHeight = () => {
      // layout viewport との差分が仮想キーボードの高さ
      const keyboardHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty(
        '--keyboard-height',
        `${keyboardHeight}px`,
      );
    };

    updateKeyboardHeight();
    vv.addEventListener('resize', updateKeyboardHeight);
    vv.addEventListener('scroll', updateKeyboardHeight);

    return () => {
      vv.removeEventListener('resize', updateKeyboardHeight);
      vv.removeEventListener('scroll', updateKeyboardHeight);
      document.documentElement.style.removeProperty('--keyboard-height');
    };
  }, []);
}
