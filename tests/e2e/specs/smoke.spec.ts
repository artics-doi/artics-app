// Smoke E2E — 起動からログイン画面表示までの最低限の経路を確認する。
//
// 実 Firebase 認証は環境依存のため、CI ではログイン後のフロー全体を確認しない。
// ローカルで `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` を設定した場合のみログインを試す。

import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { HomePage } from '../pages/HomePage';
import { PRIMARY_USER } from '../fixtures/testUsers';

test.describe('smoke: アプリの起動と基本画面', () => {
  test('ログイン画面が表示される', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(page).toHaveTitle('Articsチャット');
    await expect(page.getByRole('heading', { name: '社内チャット' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible();
    await expect(page.getByRole('link', { name: '新規登録' })).toBeVisible();
  });

  test('新規登録画面に遷移できる', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await page.getByRole('link', { name: '新規登録' }).click();
    await expect(page).toHaveURL(/#\/register$/);
    await expect(page.getByRole('button', { name: '登録する' })).toBeVisible();
  });

  // ログインから先のシナリオはテストユーザーが設定されている時のみ実行
  const hasCreds =
    process.env.E2E_USER_EMAIL !== undefined &&
    process.env.E2E_USER_PASSWORD !== undefined;

  test.describe(hasCreds ? '認証後フロー（実 Firebase）' : '認証後フロー（スキップ）', () => {
    test.skip(!hasCreds, 'E2E_USER_EMAIL / E2E_USER_PASSWORD 未設定のためスキップ');

    test('ログイン → Home → ログアウト', async ({ page }) => {
      const login = new LoginPage(page);
      const home = new HomePage(page);

      await login.goto();
      await login.login(PRIMARY_USER);
      await home.waitForReady();

      await home.logout();
      await expect(page).toHaveURL(/#\/login$/);
    });
  });
});
