import { expect, test } from '@playwright/test';

test('pwa preview: service worker, manifest, and offline navigation fallback work', async ({ context, page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('preview'), 'PWA service worker is generated only for preview/production builds');

  await page.goto('/#/login');
  await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible();

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toContain('manifest.webmanifest');

  const manifestResponse = await page.request.get(manifestHref ?? '/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible();

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
