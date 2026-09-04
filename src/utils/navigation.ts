export const DESKTOP_ENTRY_PATH = '/schedule';
export const MOBILE_ENTRY_PATH = '/';
export const ELECTRON_COMPACT_ENTRY_PATH = '/chat';
export const ELECTRON_COMPACT_MAX_WIDTH = 1023;
export const NARROW_WINDOW_QUERY = `(max-width: ${ELECTRON_COMPACT_MAX_WIDTH}px)`;

export function shouldUseDesktopWorkspace(
  isElectron: boolean,
  isNarrowWindow: boolean,
  isWideWebViewport: boolean,
): boolean {
  return isElectron ? !isNarrowWindow : isWideWebViewport;
}

export function shouldReturnScheduleToChatList(
  isElectron: boolean,
  isNarrowWindow: boolean,
  allowNarrowSchedule: boolean,
): boolean {
  return isElectron && isNarrowWindow && !allowNarrowSchedule;
}

export function isDesktopWorkspace(): boolean {
  if (typeof window === 'undefined') return false;
  const electronWindow = window as Window & { electronAPI?: unknown };
  return shouldUseDesktopWorkspace(
    !!electronWindow.electronAPI,
    window.matchMedia(NARROW_WINDOW_QUERY).matches,
    window.matchMedia('(min-width: 1024px)').matches,
  );
}

export function resolveAppEntryPath(
  isElectron: boolean,
  isNarrowWindow: boolean,
  isWideWebViewport: boolean,
): string {
  if (isElectron) {
    return isNarrowWindow ? ELECTRON_COMPACT_ENTRY_PATH : DESKTOP_ENTRY_PATH;
  }
  return isWideWebViewport ? DESKTOP_ENTRY_PATH : MOBILE_ENTRY_PATH;
}

export function getAppEntryPath(): string {
  if (typeof window === 'undefined') return MOBILE_ENTRY_PATH;
  const electronWindow = window as Window & { electronAPI?: unknown };
  return resolveAppEntryPath(
    !!electronWindow.electronAPI,
    window.matchMedia(NARROW_WINDOW_QUERY).matches,
    window.matchMedia('(min-width: 1024px)').matches,
  );
}
