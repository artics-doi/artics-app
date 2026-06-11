// 長押しと短押し（タップ）を区別して扱う hook。
//
// pointer events を使うことで mouse / touch / pen を一律に扱う。
// - onLongPress: 押し下げから ms ミリ秒以上経過した時に呼ばれる（タッチ長押し / マウス長押し）
// - onTap: ms 未満で離した場合に呼ばれる
//
// 長押し成立時はテキスト選択を抑止し、コンテキストメニュー（右クリック相当）も抑止する。

import { useCallback, useRef } from 'react';

interface UseLongPressOptions {
  onLongPress: () => void;
  onTap?: () => void;
  ms?: number;
}

interface UseLongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function useLongPress({
  onLongPress,
  onTap,
  ms = 500,
}: UseLongPressOptions): UseLongPressHandlers {
  const timerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 左クリック / タッチ / ペンの主操作のみ対象
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      longPressedRef.current = false;
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        longPressedRef.current = true;
        onLongPress();
      }, ms);
    },
    [onLongPress, ms, clearTimer],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      clearTimer();
      if (!longPressedRef.current && onTap) {
        onTap();
      }
      // 長押し成立後の up はクリック由来の onClick を発火させない
      if (longPressedRef.current) {
        e.preventDefault();
      }
    },
    [onTap, clearTimer],
  );

  const onPointerLeave = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onPointerCancel = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  // 右クリック（および iOS の長押しコンテキストメニュー）を抑止
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onLongPress();
    },
    [onLongPress],
  );

  return {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onContextMenu,
  };
}
