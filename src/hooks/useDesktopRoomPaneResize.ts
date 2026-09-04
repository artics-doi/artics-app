import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  MAX_DESKTOP_ROOM_PANE_WIDTH,
  MIN_DESKTOP_ROOM_PANE_WIDTH,
  clampDesktopRoomPaneWidth,
  getDefaultDesktopRoomPaneWidth,
  getDesktopRoomPaneMaxWidth,
} from '../lib/chat/desktopPaneResize';

export const DESKTOP_ROOM_PANE_WIDTH_KEY = 'artics-desktop-room-pane-width';

function readPreferredPaneWidth(): number {
  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth;
  const fallback = getDefaultDesktopRoomPaneWidth(viewportWidth);
  if (typeof window === 'undefined') return fallback;

  try {
    const savedValue = window.localStorage.getItem(DESKTOP_ROOM_PANE_WIDTH_KEY);
    if (savedValue === null) return fallback;
    const savedWidth = Number(savedValue);
    if (!Number.isFinite(savedWidth)) return fallback;
    return Math.min(Math.max(savedWidth, MIN_DESKTOP_ROOM_PANE_WIDTH), MAX_DESKTOP_ROOM_PANE_WIDTH);
  } catch {
    return fallback;
  }
}

export function useDesktopRoomPaneResize<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  sidePanelOpen: boolean,
) {
  const [initialPreferredPaneWidth] = useState(readPreferredPaneWidth);
  const preferredPaneWidthRef = useRef(initialPreferredPaneWidth);
  const [paneWidth, setPaneWidth] = useState(initialPreferredPaneWidth);
  const [paneMaxWidth, setPaneMaxWidth] = useState(() => (
    getDesktopRoomPaneMaxWidth(typeof window === 'undefined' ? 1440 : window.innerWidth, sidePanelOpen)
  ));
  const [isResizing, setIsResizing] = useState(false);

  const getContainerWidth = useCallback(() => (
    containerRef.current?.getBoundingClientRect().width
      ?? (typeof window === 'undefined' ? 1440 : window.innerWidth)
  ), [containerRef]);

  const setPreferredPaneWidth = useCallback((requestedWidth: number) => {
    const nextWidth = clampDesktopRoomPaneWidth(requestedWidth, getContainerWidth(), sidePanelOpen);
    preferredPaneWidthRef.current = nextWidth;
    setPaneWidth(nextWidth);
  }, [getContainerWidth, sidePanelOpen]);

  const persistPreferredPaneWidth = useCallback(() => {
    try {
      window.localStorage.setItem(
        DESKTOP_ROOM_PANE_WIDTH_KEY,
        String(preferredPaneWidthRef.current),
      );
    } catch {
      // localStorageが利用できない環境でも、現在のセッション中は希望幅を維持する。
    }
  }, []);

  useEffect(() => {
    const syncVisibleWidth = () => {
      const containerWidth = getContainerWidth();
      const maxWidth = getDesktopRoomPaneMaxWidth(containerWidth, sidePanelOpen);
      setPaneMaxWidth(maxWidth);
      // ウィンドウ縮小時は表示幅だけを一時的に収める。
      // preferredPaneWidthRefは変更せず、再び広げたときに希望幅へ戻す。
      setPaneWidth(clampDesktopRoomPaneWidth(
        preferredPaneWidthRef.current ?? MIN_DESKTOP_ROOM_PANE_WIDTH,
        containerWidth,
        sidePanelOpen,
      ));
    };

    syncVisibleWidth();
    window.addEventListener('resize', syncVisibleWidth);
    return () => window.removeEventListener('resize', syncVisibleWidth);
  }, [getContainerWidth, sidePanelOpen]);

  const handleResizePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (window.innerWidth < 1024) return;
    event.preventDefault();
    const containerLeft = containerRef.current?.getBoundingClientRect().left ?? 0;
    setPreferredPaneWidth(event.clientX - containerLeft);
    setIsResizing(true);

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMove = (moveEvent: PointerEvent) => {
      setPreferredPaneWidth(moveEvent.clientX - containerLeft);
    };
    const handleUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setIsResizing(false);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      window.removeEventListener('blur', handleUp);
      persistPreferredPaneWidth();
      window.dispatchEvent(new Event('resize'));
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    window.addEventListener('pointercancel', handleUp, { once: true });
    window.addEventListener('blur', handleUp, { once: true });
  }, [containerRef, persistPreferredPaneWidth, setPreferredPaneWidth]);

  const handleResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 32 : 8;
    let nextWidth = paneWidth;

    if (event.key === 'ArrowLeft') nextWidth -= step;
    else if (event.key === 'ArrowRight') nextWidth += step;
    else if (event.key === 'Home') nextWidth = MIN_DESKTOP_ROOM_PANE_WIDTH;
    else if (event.key === 'End') nextWidth = paneMaxWidth;
    else return;

    event.preventDefault();
    setPreferredPaneWidth(nextWidth);
    window.requestAnimationFrame(() => {
      persistPreferredPaneWidth();
      window.dispatchEvent(new Event('resize'));
    });
  }, [paneMaxWidth, paneWidth, persistPreferredPaneWidth, setPreferredPaneWidth]);

  return {
    paneWidth,
    paneMaxWidth,
    isResizing,
    paneStyle: {
      '--desktop-room-pane-width': `${paneWidth}px`,
    } as CSSProperties,
    handleResizePointerDown,
    handleResizeKeyDown,
  };
}
