import { describe, expect, it } from 'vitest';
import {
  getCompactChatWindowBounds,
  WORKSPACE_MIN_WINDOW_WIDTH,
  getWorkspaceWindowBounds,
} from '../../../electron/workspaceWindow';

describe('workspaceWindow', () => {
  it('コンパクトチャットは画面右端へ収める', () => {
    expect(getCompactChatWindowBounds(
      { x: 100, y: 40, width: 1600, height: 900 },
      { x: 0, y: 0, width: 1920, height: 1040 },
    )).toEqual({ x: 1500, y: 40, width: 420, height: 900 });
  });

  it('狭幅ウィンドウを1200pxへ広げる', () => {
    expect(getWorkspaceWindowBounds(
      { x: 100, y: 80, width: 420, height: 900 },
      { x: 0, y: 0, width: 1920, height: 1040 },
    )).toEqual({ x: 100, y: 80, width: WORKSPACE_MIN_WINDOW_WIDTH, height: 900 });
  });

  it('画面より広くせず、画面内へ位置を収める', () => {
    expect(getWorkspaceWindowBounds(
      { x: 800, y: 100, width: 420, height: 900 },
      { x: 0, y: 0, width: 1100, height: 800 },
    )).toEqual({ x: 0, y: 0, width: 1100, height: 800 });
  });

  it('すでに十分な幅がある場合はサイズを維持する', () => {
    expect(getWorkspaceWindowBounds(
      { x: 40, y: 30, width: 1500, height: 900 },
      { x: 0, y: 0, width: 1920, height: 1040 },
    )).toEqual({ x: 40, y: 30, width: 1500, height: 900 });
  });
});
