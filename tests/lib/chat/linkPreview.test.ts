import { describe, expect, test } from 'vitest';
import { firstPreviewUrl, linkPreviewCard, sanitizeLinkPreview } from '../../../src/lib/chat/linkPreview';
import {
  extractLinkPreview,
  isBlockedIpAddress,
  normalizePreviewUrl,
  resolveLinkPreview,
} from '../../../functions/src/linkPreviewSafety';

const PUBLIC_IP = '93.184.216.34';

describe('プレビューするURL', () => {
  test('本文の最初のURLが https ならそれを返す', () => {
    expect(firstPreviewUrl('詳細は https://example.com/item です')).toBe('https://example.com/item');
  });

  test('最初が http なら、後ろに https があってもプレビューしない', () => {
    expect(firstPreviewUrl('http://example.com と https://example.com/a')).toBeNull();
  });

  test('URLが無ければプレビューしない', () => {
    expect(firstPreviewUrl('明日は休みます')).toBeNull();
  });
});

describe('プレビュー結果の文字', () => {
  test('HTMLタグは文字として残さない', () => {
    expect(sanitizeLinkPreview({
      url: 'https://example.com/a',
      title: '注意 <script>alert(1)</script>',
      description: '説明',
      siteName: 'Example',
    })).toEqual({
      url: 'https://example.com/a',
      title: '注意 alert(1)',
      description: '説明',
      siteName: 'Example',
    });
  });

  test('タイトルも説明も無くても、サイト名があれば表示する', () => {
    expect(sanitizeLinkPreview({
      url: 'https://example.com/a',
      title: '',
      description: '   ',
      siteName: 'Example',
    })).toEqual({
      url: 'https://example.com/a',
      title: '',
      description: '',
      siteName: 'Example',
    });
  });

  test('サイト名が空ならURLのホスト名を使う', () => {
    expect(sanitizeLinkPreview({
      url: 'https://www.example.com/news',
      title: '',
      description: '',
      siteName: '',
    })?.siteName).toBe('www.example.com');
  });

  test('http の結果は表示しない', () => {
    expect(sanitizeLinkPreview({
      url: 'http://example.com/a',
      title: '題名',
      description: '説明',
      siteName: 'Example',
    })).toBeNull();
  });
});

describe('プレビュー先の安全判定', () => {
  test('公開の https は許可する', () => {
    expect(normalizePreviewUrl('https://Example.com/a#section')?.url).toBe('https://example.com/a');
    expect(isBlockedIpAddress(PUBLIC_IP)).toBe(false);
  });

  test('http、パスワード付き、社内、ローカル、メタデータは拒否する', () => {
    expect(normalizePreviewUrl('http://example.com/a')).toBeNull();
    expect(normalizePreviewUrl('https://user:pass@example.com/a')).toBeNull();
    expect(normalizePreviewUrl('https://127.0.0.1/')).toBeNull();
    expect(normalizePreviewUrl('https://10.1.2.3/secret')).toBeNull();
    expect(normalizePreviewUrl('https://192.168.0.8/')).toBeNull();
    expect(normalizePreviewUrl('https://169.254.169.254/latest')).toBeNull();
    expect(normalizePreviewUrl('https://metadata.google.internal/')).toBeNull();
    expect(normalizePreviewUrl('https://printer.local/')).toBeNull();
    expect(normalizePreviewUrl('https://localhost/')).toBeNull();
    expect(normalizePreviewUrl('https://example.com:8443/a')).toBeNull();
  });

  test('代表的な非公開アドレスを拒否する', () => {
    expect(isBlockedIpAddress('10.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('172.16.0.1')).toBe(true);
    expect(isBlockedIpAddress('192.168.1.20')).toBe(true);
    expect(isBlockedIpAddress('127.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('169.254.169.254')).toBe(true);
    expect(isBlockedIpAddress('::1')).toBe(true);
    expect(isBlockedIpAddress('fe80::1')).toBe(true);
    expect(isBlockedIpAddress('8.8.8.8')).toBe(false);
  });
});

describe('カードに出す行', () => {
  test('サイト名だけの題名でも、サイト名とパスを出す', () => {
    const url = 'https://www.msn.com/ja-jp/technology/news/ar-AA2fLJ3W';
    expect(linkPreviewCard({
      url,
      title: 'MSN',
      description: '',
      siteName: 'www.msn.com',
    })).toEqual({
      siteName: 'www.msn.com',
      title: 'MSN',
      description: '',
      path: '/ja-jp/technology/news/ar-AA2fLJ3W',
    });
  });

  test('題名も説明も無くても、サイト名とパスを出す', () => {
    expect(linkPreviewCard({
      url: 'https://www.msn.com/ja-jp/technology',
      title: '',
      description: '',
      siteName: 'www.msn.com',
    })).toEqual({
      siteName: 'www.msn.com',
      title: '',
      description: '',
      path: '/ja-jp/technology',
    });
  });

  test('記事の題名があるときはパスを足さない', () => {
    expect(linkPreviewCard({
      url: 'https://example.com/items/1',
      title: '箱とテープ',
      description: '詳しい説明',
      siteName: 'Example',
    })).toEqual({
      siteName: 'Example',
      title: '箱とテープ',
      description: '詳しい説明',
      path: '',
    });
  });
});

describe('HTMLからタイトルと説明を取る', () => {
  test('メタ情報の文字だけを使い、タグは捨てる', () => {
    const html = `
      <html><head>
        <meta property="og:site_name" content="Example Shop">
        <meta property="og:title" content="箱 &amp; テープ">
        <meta property="og:description" content="A &lt;b&gt;説明&lt;/b&gt;">
        <title>使わない題名</title>
      </head><body><h1>本文は使わない</h1></body></html>
    `;
    expect(extractLinkPreview(html, 'example.com')).toEqual({
      title: '箱 & テープ',
      description: 'A 説明',
      siteName: 'Example Shop',
    });
  });

  test('タイトルも説明も無ければ空のまま返す', () => {
    expect(extractLinkPreview('<html></html>', 'example.com')).toEqual({
      title: '',
      description: '',
      siteName: 'example.com',
    });
  });
});

describe('転送先も含めた取得', () => {
  test('公開ページのタイトルを、利用者が貼ったURLとして返す', async () => {
    const preview = await resolveLinkPreview('https://example.com/item', {
      lookup: async () => [PUBLIC_IP],
      fetchPage: async () => ({
        type: 'html',
        body: '<meta property="og:title" content="商品"><meta name="description" content="詳しい説明">',
      }),
    });
    expect(preview).toEqual({
      url: 'https://example.com/item',
      title: '商品',
      description: '詳しい説明',
      siteName: 'example.com',
    });
  });

  test('公開ページから社内アドレスへ転送されたら取得しない', async () => {
    const fetched: string[] = [];
    const preview = await resolveLinkPreview('https://example.com/go', {
      lookup: async (hostname) => (hostname === 'example.com' ? [PUBLIC_IP] : ['127.0.0.1']),
      fetchPage: async (url) => {
        fetched.push(url);
        return { type: 'redirect', location: 'https://127.0.0.1/admin' };
      },
    });
    expect(preview).toBeNull();
    expect(fetched).toEqual(['https://example.com/go']);
  });

  test('https から http へ転送されたら取得しない', async () => {
    const preview = await resolveLinkPreview('https://example.com/go', {
      lookup: async () => [PUBLIC_IP],
      fetchPage: async () => ({ type: 'redirect', location: 'http://example.com/plain' }),
    });
    expect(preview).toBeNull();
  });

  test('題名がサイト名だけでも、貼ったURLとして返す', async () => {
    const preview = await resolveLinkPreview('https://www.msn.com/ja-jp/technology/news/ar-AA2fLJ3W', {
      lookup: async () => [PUBLIC_IP],
      fetchPage: async () => ({
        type: 'html',
        body: '<title>MSN</title>',
      }),
    });
    expect(preview).toEqual({
      url: 'https://www.msn.com/ja-jp/technology/news/ar-AA2fLJ3W',
      title: 'MSN',
      description: '',
      siteName: 'www.msn.com',
    });
  });

  test('題名も説明も無いHTMLでも、サイト名を返す', async () => {
    const preview = await resolveLinkPreview('https://example.com/plain', {
      lookup: async () => [PUBLIC_IP],
      fetchPage: async () => ({ type: 'html', body: '<html></html>' }),
    });
    expect(preview).toEqual({
      url: 'https://example.com/plain',
      title: '',
      description: '',
      siteName: 'example.com',
    });
  });

  test('名前解決に失敗したら取得しない', async () => {
    const preview = await resolveLinkPreview('https://example.com/a', {
      lookup: async () => {
        throw new Error('dns failed');
      },
      fetchPage: async () => ({ type: 'html', body: '<title>題名</title>' }),
    });
    expect(preview).toBeNull();
  });
});
