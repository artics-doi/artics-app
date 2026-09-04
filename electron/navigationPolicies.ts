// URL / NAS パスの許可判定と開発サーバー URL 解決。main.ts から機械的に移動（挙動変更なし）。

import { app, shell } from 'electron';

const ALLOWED_NAS_HOSTS = new Set(['nas-1', 'nas-3']);

export function isAllowedNasPath(targetPath: string): boolean {
  if (!targetPath.startsWith('\\\\')) return false;
  const host = targetPath.slice(2).split('\\', 1)[0]?.toLowerCase();
  return Boolean(host && ALLOWED_NAS_HOSTS.has(host));
}

// 開発モードかどうか
export const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

const ALLOWED_EXTERNAL_PROTOCOLS = ['https:'];

export async function openExternalUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.includes(parsed.protocol)) {
      console.warn('ブロックされたURL:', url);
      return false;
    }

    await shell.openExternal(url);
    return true;
  } catch (error) {
    console.error('外部URLを開けませんでした:', url, error);
    return false;
  }
}

export function isAppNavigationUrl(url: string, devServerUrl: string): boolean {
  if (url === 'about:blank') return true;
  if (isDev) {
    return url.startsWith(devServerUrl);
  }
  return url.startsWith('file://');
}

export const ELECTRON_ENTRY_HASH = '/schedule';

export function getDevServerEntryUrl(devServerUrl: string): string {
  try {
    const url = new URL(devServerUrl);
    url.hash = ELECTRON_ENTRY_HASH;
    return url.toString();
  } catch {
    const baseUrl = devServerUrl.replace(/[#?].*$/, '').replace(/\/$/, '');
    return `${baseUrl}/#${ELECTRON_ENTRY_HASH}`;
  }
}
