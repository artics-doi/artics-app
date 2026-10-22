import { describe, expect, test } from 'vitest';
import {
  getClipboardFiles,
  getClipboardImageFiles,
  validatePendingAttachments,
} from '../../../src/lib/chat/pendingAttachments';
import { blockedAttachmentMessage, isBlockedAttachmentName } from '../../../src/lib/chat/blockedAttachments';

describe('validatePendingAttachments', () => {
  const maxBytes = 25;

  test('保留中の全ファイルが上限内なら許可する', () => {
    expect(validatePendingAttachments([
      { name: 'a.txt', size: 10 },
      { name: 'b.txt', size: 15 },
    ], maxBytes)).toEqual({ valid: true });
  });

  test('複数回追加後の合計サイズ超過を拒否する', () => {
    expect(validatePendingAttachments([
      { name: 'a.txt', size: 15 },
      { name: 'b.txt', size: 11 },
    ], maxBytes)).toEqual({ valid: false, reason: 'total-too-large', size: 26 });
  });

  test('単体で上限を超えたファイル名を返す', () => {
    expect(validatePendingAttachments([
      { name: 'large.pdf', size: 26 },
    ], maxBytes)).toEqual({
      valid: false,
      reason: 'file-too-large',
      fileName: 'large.pdf',
      size: 26,
    });
  });
});

describe('getClipboardImageFiles', () => {
  test('クリップボードから画像ファイルだけを取り出す', () => {
    const image = { name: 'image.png', size: 10, type: 'image/png' } as File;
    const textFile = { name: 'note.txt', size: 5, type: 'text/plain' } as File;

    const result = getClipboardImageFiles([
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'text/plain', getAsFile: () => textFile },
      { kind: 'file', type: 'image/png', getAsFile: () => image },
    ]);

    expect(result).toEqual([image]);
  });

  test('画像項目でもFileを取得できない場合は無視する', () => {
    expect(getClipboardImageFiles([
      { kind: 'file', type: 'image/png', getAsFile: () => null },
    ])).toEqual([]);
  });
});

describe('実行形式の添付', () => {
  test('実行形式と、その兄弟形式だけを拒否する', () => {
    expect(isBlockedAttachmentName('setup.EXE')).toBe(true);
    expect(isBlockedAttachmentName('folder/run.bat')).toBe(true);
    expect(isBlockedAttachmentName('tool.ps1.')).toBe(true);
    expect(isBlockedAttachmentName('script.js')).toBe(true);
    expect(isBlockedAttachmentName('link.lnk')).toBe(true);
  });

  test('gz や通常の文書は許可する', () => {
    expect(isBlockedAttachmentName('backup.tar.gz')).toBe(false);
    expect(isBlockedAttachmentName('photo.png')).toBe(false);
    expect(isBlockedAttachmentName('notes.txt')).toBe(false);
  });

  test('拒否理由に、zipへまとめれば送れることを書く', () => {
    expect(blockedAttachmentMessage(['setup.exe'])).toBe(
      '「setup.exe」は実行形式のファイルのため送信できません。zipにまとめれば送れます。',
    );
  });
});

describe('getClipboardFiles', () => {
  test('画像以外のファイルも貼り付け対象に含める', () => {
    const archive = { name: 'backup.gz', size: 10, type: 'application/gzip' } as File;
    const program = { name: 'setup.exe', size: 10, type: 'application/octet-stream' } as File;
    const result = getClipboardFiles([
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'application/gzip', getAsFile: () => archive },
      { kind: 'file', type: 'application/octet-stream', getAsFile: () => program },
    ]);
    expect(result).toEqual([archive, program]);
  });
});
