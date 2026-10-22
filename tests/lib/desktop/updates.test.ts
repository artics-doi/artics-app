import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  checkEmbeddedUpdateConfig,
  checkUpdateFeedConfig,
  planDesktopUpdateFiles,
} from '../../../src/lib/desktopUpdates';

const exe = 'ArticsChat.Setup.1.3.5.exe';
const blockmap = `${exe}.blockmap`;
const latestYml = [
  'version: 1.3.5',
  'files:',
  `  - url: ${exe}`,
  '    sha512: abc+def/ghi=',
  '    size: 10',
  `path: ${exe}`,
  'sha512: abc+def/ghi=',
  "releaseDate: '2026-10-22T00:00:00.000Z'",
  '',
].join('\n');

describe('checkUpdateFeedConfig', () => {
  test('リポジトリの設定は更新専用サイトを指す', () => {
    const electronBuilder = JSON.parse(readFileSync('electron-builder.json', 'utf8')) as { publish?: unknown };
    const hosting = JSON.parse(readFileSync('firebase.desktop-updates.json', 'utf8')) as {
      hosting?: { site?: unknown; public?: unknown };
    };

    const result = checkUpdateFeedConfig(electronBuilder, hosting);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.siteId).toBe('company-chat-a9cf0-updates');
    expect(result.feedUrl).toBe('https://company-chat-a9cf0-updates.web.app/');
  });

  test('末尾スラッシュが無くても同じフィードとして扱う', () => {
    const result = checkUpdateFeedConfig(
      {
        publish: {
          provider: 'generic',
          url: 'https://company-chat-a9cf0-updates.web.app',
          useMultipleRangeRequest: false,
        },
      },
      { hosting: { site: 'company-chat-a9cf0-updates', public: 'desktop-updates' } },
    );

    expect(result.ok).toBe(true);
  });

  test('github プロバイダは拒否する', () => {
    const result = checkUpdateFeedConfig(
      { publish: { provider: 'github', owner: 'artics-doi', repo: 'artics-app' } },
      { hosting: { site: 'company-chat-a9cf0-updates', public: 'desktop-updates' } },
    );

    expect(result.ok).toBe(false);
  });

  test('publish が複数あると拒否する', () => {
    const result = checkUpdateFeedConfig(
      {
        publish: [
          { provider: 'generic', url: 'https://company-chat-a9cf0-updates.web.app/', useMultipleRangeRequest: false },
          { provider: 'github', owner: 'artics-doi', repo: 'artics-app' },
        ],
      },
      { hosting: { site: 'company-chat-a9cf0-updates', public: 'desktop-updates' } },
    );

    expect(result.ok).toBe(false);
  });
});

describe('planDesktopUpdateFiles', () => {
  test('latest.yml と exe と blockmap だけを選ぶ', () => {
    const result = planDesktopUpdateFiles({
      ymlText: latestYml,
      expectedVersion: '1.3.5',
      availableNames: ['latest.yml', exe, blockmap, 'builder-debug.yml', 'unrelated.txt'],
    });

    expect(result.ok).toBe(true);
    expect(result.files).toEqual(['latest.yml', exe, blockmap]);
  });

  test('改行が CRLF でもファイル名を読める', () => {
    const result = planDesktopUpdateFiles({
      ymlText: latestYml.replaceAll('\n', '\r\n'),
      expectedVersion: '1.3.5',
      availableNames: ['latest.yml', exe, blockmap],
    });

    expect(result.ok).toBe(true);
  });

  test('package.json とバージョンが違うと拒否する', () => {
    const result = planDesktopUpdateFiles({
      ymlText: latestYml,
      expectedVersion: '1.3.4',
      availableNames: ['latest.yml', exe, blockmap],
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('1.3.4'))).toBe(true);
  });

  test('フォルダ区切りや URL は配信しない', () => {
    const escaped = planDesktopUpdateFiles({
      ymlText: latestYml.replace(exe, '../secret.exe'),
      expectedVersion: '1.3.5',
      availableNames: ['latest.yml', '../secret.exe'],
    });
    const absolute = planDesktopUpdateFiles({
      ymlText: latestYml.replaceAll(exe, 'https://example.com/app.exe'),
      expectedVersion: '1.3.5',
      availableNames: ['latest.yml', 'https://example.com/app.exe'],
    });

    expect(escaped.ok).toBe(false);
    expect(escaped.files).not.toContain('../secret.exe');
    expect(absolute.ok).toBe(false);
  });

  test('blockmap が無いと拒否する', () => {
    const result = planDesktopUpdateFiles({
      ymlText: latestYml,
      expectedVersion: '1.3.5',
      availableNames: ['latest.yml', exe],
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes(blockmap))).toBe(true);
  });
});

describe('checkEmbeddedUpdateConfig', () => {
  test('generic の埋め込み設定を受け入れる', () => {
    const text = [
      'provider: generic',
      'url: https://company-chat-a9cf0-updates.web.app/',
      'useMultipleRangeRequest: false',
      'updaterCacheDirName: articschat-updater',
      '',
    ].join('\n');

    expect(checkEmbeddedUpdateConfig(text, 'https://company-chat-a9cf0-updates.web.app/').ok).toBe(true);
  });

  test('github の埋め込み設定は拒否する', () => {
    const text = ['provider: github', 'owner: artics-doi', 'repo: artics-app', ''].join('\n');
    expect(checkEmbeddedUpdateConfig(text, 'https://company-chat-a9cf0-updates.web.app/').ok).toBe(false);
  });
});
