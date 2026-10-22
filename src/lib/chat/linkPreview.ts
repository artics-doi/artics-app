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

/** 関数の戻り値を、画面に出してよい文字だけにする。HTMLはそのまま出さない。 */
export function sanitizeLinkPreview(value: unknown): LinkPreview | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const url = typeof record.url === 'string' ? record.url : '';
  if (!isAllowedHttpsUrl(url)) return null;
  const title = plainPreviewText(record.title);
  const description = plainPreviewText(record.description);
  const siteName = plainPreviewText(record.siteName);
  if (!title && !description) return null;
  return { url, title, description, siteName };
}
