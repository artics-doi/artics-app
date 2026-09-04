import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-preview' }]],
  outputDir: 'test-results-preview',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop-preview',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile-preview',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npm run preview:e2e',
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
