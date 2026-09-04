import { describe, expect, test } from 'vitest';
import {
  ELECTRON_COMPACT_MAX_WIDTH,
  resolveAppEntryPath,
  shouldReturnScheduleToChatList,
  shouldUseDesktopWorkspace,
} from '../../../src/utils/navigation';

describe('resolveAppEntryPath', () => {
  test('3カラムCSSが有効になる直前までElectronコンパクト表示を使う', () => {
    expect(ELECTRON_COMPACT_MAX_WIDTH).toBe(1023);
  });

  test('狭いElectronはスマホHomeではなく専用チャット一覧を開く', () => {
    expect(resolveAppEntryPath(true, true, false)).toBe('/chat');
  });

  test('広いElectronと広いWebはデスクトップ予定表を開く', () => {
    expect(resolveAppEntryPath(true, false, false)).toBe('/schedule');
    expect(resolveAppEntryPath(false, false, true)).toBe('/schedule');
  });

  test('狭いWebだけは従来どおりスマホHomeを開く', () => {
    expect(resolveAppEntryPath(false, true, false)).toBe('/');
  });
});

describe('shouldUseDesktopWorkspace', () => {
  test('Electronでは広いウィンドウだけをデスクトップ表示とする', () => {
    expect(shouldUseDesktopWorkspace(true, false, false)).toBe(true);
    expect(shouldUseDesktopWorkspace(true, true, true)).toBe(false);
  });

  test('Webでは1024px以上の判定を維持する', () => {
    expect(shouldUseDesktopWorkspace(false, false, true)).toBe(true);
    expect(shouldUseDesktopWorkspace(false, true, false)).toBe(false);
  });
});

describe('shouldReturnScheduleToChatList', () => {
  test('Electronの予定表を縮小したときはチャット一覧へ戻す', () => {
    expect(shouldReturnScheduleToChatList(true, true, false)).toBe(true);
  });

  test('小さい画面で予定表を選び直した場合は表示を許可する', () => {
    expect(shouldReturnScheduleToChatList(true, true, true)).toBe(false);
  });

  test('Webまたは広いElectron画面では戻さない', () => {
    expect(shouldReturnScheduleToChatList(false, true, false)).toBe(false);
    expect(shouldReturnScheduleToChatList(true, false, false)).toBe(false);
  });
});
