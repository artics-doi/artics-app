// Playwright 設定（ArticsChat E2E）
//
// - 社内利用のため Chromium のみテスト対象。
// - `npm run dev:e2e` で Vite を 127.0.0.1:5173 に固定して立ち上げる。
// - 初期実装は実 Firebase 接続前提。エミュレーター整備は別タスク。

import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: false, // 実 Firebase を使うため逐次実行で安全側に寄せる
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npm run dev:e2e',
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
