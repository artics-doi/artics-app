import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const electronMain = readFileSync(resolve(process.cwd(), 'electron/main.ts'), 'utf8');
const electronPreload = readFileSync(resolve(process.cwd(), 'electron/preload.ts'), 'utf8');

describe('Electron main window sizing', () => {
  it('allows the compact chat workspace to shrink to 420px', () => {
    expect(electronMain).toMatch(/const MAIN_WINDOW_MIN_WIDTH = 420;/);
    expect(electronMain).toMatch(/minWidth:\s*MAIN_WINDOW_MIN_WIDTH/);
  });

  it('expands compact windows before opening a desktop workspace', () => {
    expect(electronMain).toMatch(/ipcMain\.handle\('expand-to-workspace'/);
    expect(electronMain).toMatch(/getWorkspaceWindowBounds\(currentBounds, workArea\)/);
    expect(electronPreload).toMatch(/expandToWorkspace: \(\): Promise<boolean>/);
  });

  it('keeps visible notifications when toggling compact chat mode', () => {
    const compactHandler = electronMain.match(
      /ipcMain\.handle\('toggle-chat-compact',[\s\S]*?(?=\n\s*\/\/ 通知ウィンドウを閉じる)/,
    )?.[0];

    expect(compactHandler).toBeDefined();
    expect(compactHandler).not.toContain('mainWindow.show()');
    expect(compactHandler).toContain('mainWindow.focus()');
  });
});
