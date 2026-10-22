// ログイン済みユーザーが、送信直前に先頭の https URL を1回だけ調べる。
// 結果は呼び出し元がメッセージへ保存する。表示のたびに取り直さない。
// 同じ URL は7日間、linkPreviews に覚えて外へ取りに行かない。

import { createHash } from 'node:crypto';
import type { LookupOptions } from 'node:dns';
import { lookup } from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';
import * as https from 'node:https';
import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  normalizePreviewUrl,
  resolveLinkPreview,
  type PreviewPage,
} from './linkPreviewSafety';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 5000;

type StoredPreview = {
  url: string;
  title: string;
  description: string;
  siteName: string;
};

function cacheId(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

async function lookupAddresses(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function fetchHttps(url: string, address: string): Promise<PreviewPage> {
  const parsed = new URL(url);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (page: PreviewPage) => {
      if (settled) return;
      settled = true;
      resolve(page);
    };
    const request = https.request({
      protocol: 'https:',
      hostname: parsed.hostname,
      servername: parsed.hostname,
      path: `${parsed.pathname}${parsed.search}`,
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'ArticsChatLinkPreview/1.0',
        Host: parsed.host,
      },
      timeout: REQUEST_TIMEOUT_MS,
      // 接続先は、直前に社内アドレスでないと確認したIPだけにする。
      lookup: (hostname: string, options: LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
        void hostname;
        void options;
        callback(null, address, address.includes(':') ? 6 : 4);
      },
    }, (response: IncomingMessage) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        response.resume();
        finish({ type: 'redirect', location: headerValue(response.headers.location) });
        return;
      }
      const contentType = headerValue(response.headers['content-type']);
      if (status < 200 || status >= 300 || !/^(text\/html|application\/xhtml\+xml)/i.test(contentType)) {
        response.resume();
        finish({ type: 'ignore' });
        return;
      }
      const chunks: Uint8Array[] = [];
      let received = 0;
      const finishHtml = () => {
        const total = chunks.reduce((sum, part) => sum + part.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        chunks.forEach((part) => {
          merged.set(part, offset);
          offset += part.length;
        });
        finish({ type: 'html', body: new TextDecoder().decode(merged) });
      };
      response.on('data', (chunk: Uint8Array) => {
        if (received >= MAX_BYTES) return;
        const slice = chunk.subarray(0, MAX_BYTES - received);
        chunks.push(slice);
        received += slice.length;
        if (received >= MAX_BYTES) {
          finishHtml();
          response.destroy();
        }
      });
      response.on('end', finishHtml);
      response.on('error', () => {
        if (chunks.length > 0) finishHtml();
        else finish({ type: 'ignore' });
      });
    });
    request.on('timeout', () => {
      request.destroy();
      finish({ type: 'ignore' });
    });
    request.on('error', () => finish({ type: 'ignore' }));
    request.end();
  });
}

async function readFreshCache(
  db: admin.firestore.Firestore,
  url: string,
): Promise<StoredPreview | null> {
  const snapshot = await db.collection('linkPreviews').doc(cacheId(url)).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  const fetchedAt = data?.fetchedAt;
  if (!data || typeof fetchedAt?.toMillis !== 'function') return null;
  if (Date.now() - fetchedAt.toMillis() > CACHE_TTL_MS) return null;
  if (data.url !== url) return null;
  if (typeof data.title !== 'string' || typeof data.description !== 'string' || typeof data.siteName !== 'string') {
    return null;
  }
  if (!data.title && !data.description) return null;
  return {
    url: data.url,
    title: data.title,
    description: data.description,
    siteName: data.siteName,
  };
}

export const fetchLinkPreview = onCall(
  {
    region: 'asia-northeast1',
    timeoutSeconds: 15,
    memory: '256MiB',
    maxInstances: 3,
  },
  async (request): Promise<{ preview: StoredPreview | null }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    const rawUrl = request.data?.url;
    if (typeof rawUrl !== 'string' || rawUrl.length > 2000) {
      throw new HttpsError('invalid-argument', 'url is required.');
    }

    const normalized = normalizePreviewUrl(rawUrl);
    if (!normalized) return { preview: null };

    const db = admin.firestore();
    try {
      const cached = await readFreshCache(db, normalized.url);
      if (cached) return { preview: cached };
    } catch (error) {
      console.error('link preview cache read failed', error);
    }

    let checkedAddress = '';
    const preview = await resolveLinkPreview(normalized.url, {
      lookup: async (hostname) => {
        const addresses = await lookupAddresses(hostname);
        checkedAddress = addresses.find((address) => address.length > 0) ?? '';
        return addresses;
      },
      fetchPage: (url) => fetchHttps(url, checkedAddress),
    });
    if (!preview) return { preview: null };

    try {
      await db.collection('linkPreviews').doc(cacheId(preview.url)).set({
        url: preview.url,
        title: preview.title,
        description: preview.description,
        siteName: preview.siteName,
        fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error('link preview cache write failed', error);
    }
    return { preview };
  },
);
