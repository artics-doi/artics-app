// メッセージ本文から、プレビューしてよい先頭のURLを1つだけ選ぶ。
// 取得と保存は送信時に行い、表示側は保存済みの文字だけを出す。

import { isAllowedHttpsUrl } from '../security/resourceTarget';

const FIRST_URL_PATTERN = /https?:\/\/[^\s]+/;
const TEXT_LIMIT = 300;

export type LinkPreview = {
  url: string;
  title: string;
  description: string;
  siteName: string;
};

function plainPreviewText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TEXT_LIMIT);
}

/** 本文の最初のURLが https のときだけ、その文字列を返す。http が先ならプレビューしない。 */
export function firstPreviewUrl(text: string): string | null {
  const match = FIRST_URL_PATTERN.exec(text);
  if (!match) return null;
  const candidate = match[0];
  if (!isAllowedHttpsUrl(candidate)) return null;
  return candidate;
}

function compactLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

/** タイトルが空、またはサイト名そのものなら、記事の題名としては弱い。 */
export function isWeakPreviewTitle(title: string, siteName: string, hostname: string): boolean {
  const label = compactLabel(title);
  if (!label) return true;
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  const withoutWww = host.replace(/^www\./, '');
  const bare = withoutWww.split('.')[0] ?? withoutWww;
  const names = [siteName, host, withoutWww, bare].map(compactLabel).filter(Boolean);
  return names.includes(label);
}

export type LinkPreviewCard = {
  siteName: string;
  title: string;
  description: string;
  path: string;
};

/** 画面に出す行。題名が弱いときはサイト名とパスを残す。 */
export function linkPreviewCard(preview: LinkPreview): LinkPreviewCard | null {
  if (!isAllowedHttpsUrl(preview.url)) return null;
  let hostname = '';
  let path = '';
  try {
    const parsed = new URL(preview.url);
    hostname = parsed.hostname;
    const suffix = `${parsed.pathname}${parsed.search}`;
    path = suffix && suffix !== '/' ? suffix : '';
  } catch {
    return null;
  }
  const siteName = preview.siteName || hostname;
  const title = preview.title;
  const description = preview.description;
  if (!title && !description && !siteName) return null;
  const weak = isWeakPreviewTitle(title, siteName, hostname);
  return {
    siteName,
    title,
    description,
    path: weak ? path : '',
  };
}

/** 関数の戻り値を、画面に出してよい文字だけにする。HTMLはそのまま出さない。 */
export function sanitizeLinkPreview(value: unknown): LinkPreview | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const url = typeof record.url === 'string' ? record.url : '';
  if (!isAllowedHttpsUrl(url)) return null;
  const title = plainPreviewText(record.title);
  const description = plainPreviewText(record.description);
  let siteName = plainPreviewText(record.siteName);
  if (!siteName) {
    try {
      siteName = new URL(url).hostname;
    } catch {
      siteName = '';
    }
  }
  if (!title && !description && !siteName) return null;
  return { url, title, description, siteName };
}
