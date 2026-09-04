import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/electron',
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  timeout: 60_000,
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4175 --strictPort',
    port: 4175,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
