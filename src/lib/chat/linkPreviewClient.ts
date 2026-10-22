// 送信ボタンの直前に、ログイン済みユーザーとしてプレビュー関数を1回呼ぶ。
// 失敗しても送信は止めない。呼び出し元がリンクだけのメッセージを保存する。

import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '../firebase';
import { sanitizeLinkPreview, type LinkPreview } from './linkPreview';

const previewFunctions = getFunctions(app, 'asia-northeast1');
const REQUEST_TIMEOUT_MS = 8000;

const requestPreview = httpsCallable<
  { url: string },
  { preview: unknown }
>(previewFunctions, 'fetchLinkPreview', { timeout: REQUEST_TIMEOUT_MS });

export async function fetchStoredLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    const result = await requestPreview({ url });
    return sanitizeLinkPreview(result.data?.preview);
  } catch {
    return null;
  }
}
