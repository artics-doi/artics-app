// renderMessageText の特性テスト。
// 非 Electron（node 環境 = isElectronEnv() が false）での現挙動を HTML 構造として固定する。
// CSS Modules は vitest では空オブジェクトになるためクラス名はアサートしない。

import { describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMentions, renderMessageText } from '../../../src/components/chat/messageText';

const noopToast = vi.fn();

function html(node: React.ReactNode): string {
  return renderToStaticMarkup(<>{node}</>);
}

describe('renderMessageText', () => {
  test('空文字は null', () => {
    expect(renderMessageText('', noopToast)).toBeNull();
  });

  test('プレーンテキストはそのまま出力される', () => {
    expect(html(renderMessageText('こんにちは', noopToast))).toBe('こんにちは');
  });

  test('http/https URL はリンク化される（target=_blank, rel あり）', () => {
    const out = html(renderMessageText('参照 https://example.com/page を見て', noopToast));
    expect(out).toContain('<a');
    expect(out).toContain('href="https://example.com/page"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('参照 ');
    expect(out).toContain(' を見て');
  });

  test('URL は空白で区切られ、複数あればそれぞれリンク化される', () => {
    const out = html(renderMessageText('a https://a.example b http://b.example c', noopToast));
    expect(out.match(/<a /g)).toHaveLength(2);
  });

  test('@メンションは span でハイライトされる', () => {
    const out = html(renderMessageText('@田中 さんお願いします', noopToast));
    expect(out).toContain('<span');
    expect(out).toContain('@田中');
    expect(out).toContain(' さんお願いします');
  });

  test('非 Electron 環境では NAS パスはリンク化されずプレーンテキストになる', () => {
    const out = html(renderMessageText(String.raw`資料は \\Nas-1\share\doc.xlsx です`, noopToast));
    expect(out).not.toContain('<button');
    expect(out).toContain('\\\\Nas-1\\share\\doc.xlsx');
  });

  test('引用符つき NAS パス（空白入り）もマッチ対象（非 Electron ではテキストのまま）', () => {
    const out = html(renderMessageText(String.raw`"\\Nas-3\共有 フォルダ\資料.pdf" 参照`, noopToast));
    expect(out).not.toContain('<button');
    expect(out).toContain('資料.pdf');
  });

  test('URL とメンションの混在', () => {
    const out = html(renderMessageText('@佐藤 https://example.com 確認', noopToast));
    expect(out).toContain('<span');
    expect(out).toContain('<a');
  });
});

describe('renderMentions', () => {
  test('@から始まる連続文字列だけが span になる', () => {
    const out = html(renderMentions('hi @bob and @alice!', 'k'));
    expect(out.match(/<span/g)).toHaveLength(2);
    expect(out).toContain('@bob');
    expect(out).toContain('@alice!');
  });

  test('メンションがなければテキストのみ', () => {
    expect(html(renderMentions('plain text', 'k'))).toBe('plain text');
  });
});
