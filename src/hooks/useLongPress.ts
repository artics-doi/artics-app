// 長押しと短押し（タップ）を区別して扱う hook。
//
// - マウス: 長押しタイマーは張らない。動かさず離したときだけ onTap（メニュー）。
//   ドラッグは文字選択なのでメニューを開かない。
// - タッチ / ペン: 押したまま ms ミリ秒で onLongPress。その直前にブラウザの選択は消す。
//   指が動いたらスクロールなのでメニューは開かない。
// - 右クリック: 選択は消さず onLongPress。すでに長押しで開いていれば重ねて開かない。

import { useCallback, useRef } from 'react';
import {
  classifyPointerIntent,
  passedMoveThreshold,
  shouldArmLongPress,
  shouldClearSelectionOnLongPress,
  shouldOpenMenuOnRelease,
  type PointerIntent,
} from '../lib/chat/messageSelection';

interface UseLongPressOptions {
  onLongPress: () => void;
  onTap?: () => void;
  /** メニューを開く直前。選択範囲の記録など、描画前にやりたい処理。 */
  onBeforeOpen?: () => void;
  ms?: number;
}

interface UseLongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function useLongPress({
  onLongPress,
  onTap,
  onBeforeOpen,
  ms = 500,
}: UseLongPressOptions): UseLongPressHandlers {
  const timerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);
  const movedRef = useRef(false);
  const trackingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const intentRef = useRef<PointerIntent>('mouse');

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const openMenu = useCallback(() => {
    onBeforeOpen?.();
    onLongPress();
  }, [onBeforeOpen, onLongPress]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      intentRef.current = classifyPointerIntent(e.pointerType);
      // 右クリックは contextmenu 側で開く。ここでも開くとメニューがすぐ閉じる。
      if (e.pointerType === 'mouse' && e.button !== 0) {
        // 新しい右クリックは、直前の長押しで立てたフラグを引き継がない。
        longPressedRef.current = false;
        trackingRef.current = false;
        return;
      }
      longPressedRef.current = false;
      movedRef.current = false;
      trackingRef.current = true;
      startRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      if (!shouldArmLongPress(intentRef.current)) return;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        if (!trackingRef.current || longPressedRef.current) return;
        longPressedRef.current = true;
        trackingRef.current = false;
        if (shouldClearSelectionOnLongPress(intentRef.current)) {
          window.getSelection()?.removeAllRanges();
        }
        openMenu();
      }, ms);
    },
    [clearTimer, ms, openMenu],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!trackingRef.current || movedRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (!passedMoveThreshold(dx, dy)) return;
      movedRef.current = true;
      clearTimer();
    },
    [clearTimer],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearTimer();
      const open = trackingRef.current && shouldOpenMenuOnRelease({
        intent: intentRef.current,
        moved: movedRef.current,
        longPressed: longPressedRef.current,
      });
      trackingRef.current = false;
      if (open) {
        onBeforeOpen?.();
        onTap?.();
      }
      if (longPressedRef.current) {
        e.preventDefault();
      }
    },
    [onBeforeOpen, onTap, clearTimer],
  );

  const onPointerLeave = useCallback(() => {
    if (!trackingRef.current) return;
    // 吹き出しの外へ出たドラッグは、離した場所でメニューを開かない。
    movedRef.current = true;
    trackingRef.current = false;
    clearTimer();
  }, [clearTimer]);

  const onPointerCancel = useCallback(() => {
    trackingRef.current = false;
    clearTimer();
  }, [clearTimer]);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // タッチ長押しの直後に出るブラウザメニューは、もう一度開くと閉じてしまう。
      if (longPressedRef.current) return;
      const openedByTouch = trackingRef.current && shouldClearSelectionOnLongPress(intentRef.current);
      if (openedByTouch) {
        window.getSelection()?.removeAllRanges();
      }
      longPressedRef.current = true;
      trackingRef.current = false;
      clearTimer();
      openMenu();
    },
    [clearTimer, openMenu],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onContextMenu,
  };
}
