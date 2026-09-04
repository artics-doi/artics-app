import { useCallback, useSyncExternalStore } from 'react';

/**
 * スマホ幅（既定 640px 以下）かどうかを返す。
 *
 * ホーム画面のスマホ向けレイアウトは基本 CSS の `@media (max-width: 640px)` で切り替える。
 * このフックは CSS では切り替えられないもの（子コンポーネントに渡す size prop など）だけに使う。
 *
 * `useSyncExternalStore` を使うのは、effect 内で setState して再レンダリングを重ねないため。
 */
export function useIsNarrowViewport(maxWidth = 640): boolean {
  const query = `(max-width: ${maxWidth}px)`;

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onStoreChange);
    return () => mql.removeEventListener('change', onStoreChange);
  }, [query]);

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  // サーバー側では常に false（デスクトップ扱い）
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
