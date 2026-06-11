export const DESKTOP_ENTRY_PATH = '/schedule';
export const MOBILE_ENTRY_PATH = '/';

export function isDesktopWorkspace(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.electronAPI) return true;
  return window.matchMedia('(min-width: 1024px)').matches;
}

export function getAppEntryPath(): string {
  return isDesktopWorkspace() ? DESKTOP_ENTRY_PATH : MOBILE_ENTRY_PATH;
}
