import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

test('Electron main/preload/renderer integration starts with the hardened API', async () => {
  const electronApp = await electron.launch({
    args: [path.join(process.cwd(), 'dist-electron/main.js'), '--hidden'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: 'http://127.0.0.1:4175',
    },
  });

  try {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (
      window as unknown as { electronAPI?: { isElectron(): Promise<boolean> } }
    ).electronAPI?.isElectron())).toBe(true);
    await expect.poll(() => page.evaluate(() => (
      window as unknown as { electronAPI?: { getAlwaysOnTop(): Promise<boolean> } }
    ).electronAPI?.getAlwaysOnTop())).toBe(false);
    const windowCount = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    expect(windowCount).toBeGreaterThanOrEqual(1);
  } finally {
    await electronApp.close();
  }
});
