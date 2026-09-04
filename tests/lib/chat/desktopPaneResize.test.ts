import { describe, expect, it } from 'vitest';
import {
  MAX_DESKTOP_ROOM_PANE_WIDTH,
  MIN_DESKTOP_ROOM_PANE_WIDTH,
  clampDesktopRoomPaneWidth,
  getDefaultDesktopRoomPaneWidth,
  getDesktopRoomPaneMaxWidth,
} from '../../../src/lib/chat/desktopPaneResize';

describe('desktopPaneResize', () => {
  it('画面幅に応じた既定幅を返す', () => {
    expect(getDefaultDesktopRoomPaneWidth(1024)).toBe(280);
    expect(getDefaultDesktopRoomPaneWidth(1440)).toBe(360);
    expect(getDefaultDesktopRoomPaneWidth(2000)).toBe(424);
  });

  it('中央と右ペインを残した最大幅を計算する', () => {
    expect(getDesktopRoomPaneMaxWidth(1024, true)).toBe(356);
    expect(getDesktopRoomPaneMaxWidth(1024, false)).toBe(656);
    expect(getDesktopRoomPaneMaxWidth(1920, false)).toBe(MAX_DESKTOP_ROOM_PANE_WIDTH);
  });

  it('要求幅を利用可能な範囲に収める', () => {
    expect(clampDesktopRoomPaneWidth(100, 1600, true)).toBe(MIN_DESKTOP_ROOM_PANE_WIDTH);
    expect(clampDesktopRoomPaneWidth(900, 1600, true)).toBe(MAX_DESKTOP_ROOM_PANE_WIDTH);
    expect(clampDesktopRoomPaneWidth(480, 1024, true)).toBe(356);
  });

  it('一時的な画面縮小後も保存した希望幅から復元できる', () => {
    const preferredWidth = MAX_DESKTOP_ROOM_PANE_WIDTH;
    const temporarilyVisibleWidth = clampDesktopRoomPaneWidth(preferredWidth, 1024, true);
    const restoredWidth = clampDesktopRoomPaneWidth(preferredWidth, 1600, true);

    expect(temporarilyVisibleWidth).toBe(356);
    expect(restoredWidth).toBe(preferredWidth);
  });
});
