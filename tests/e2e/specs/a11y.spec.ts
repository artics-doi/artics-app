// S3-G-1: axe-core によるアクセシビリティ自動検査
// WCAG AA レベルの違反が 0 であることを assert。
// 検査対象: Login / Register（認証不要画面）。Home / Chat / Memo はテスト用認証情報が
// 必要なため、Sprint 共通のスモークが認証情報を持ったときに合わせて追加する。

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  HAS_E2E_CREDS,
  createProcessProject,
  deleteProcessProject,
  expectNoA11yViolations,
  loginForProcess,
  openProcessProjectBoard,
  uniqueProcessName,
} from '../pages/ProcessPage';

test.describe('a11y: WCAG AA 違反 0 検査', () => {
  test('Login 画面に WCAG AA 違反がない', async ({ page }) => {
    await page.goto('/#/login');
    await page.waitForLoadState('domcontentloaded');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (results.violations.length > 0) {
      console.log('A11y violations on /#/login:', JSON.stringify(results.violations, null, 2));
    }
    expect(results.violations).toEqual([]);
  });

  test('Register 画面に WCAG AA 違反がない', async ({ page }) => {
    await page.goto('/#/register');
    await page.waitForLoadState('domcontentloaded');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (results.violations.length > 0) {
      console.log('A11y violations on /#/register:', JSON.stringify(results.violations, null, 2));
    }
    expect(results.violations).toEqual([]);
  });
});

test.describe('a11y: 工程管理 WCAG AA 違反 0 検査', () => {
  test.skip(!HAS_E2E_CREDS, 'E2E_USER_EMAIL / E2E_USER_PASSWORD 未設定のためスキップ');

  test('工程管理の主要画面に WCAG AA 違反がない', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('mobile'), '工程管理はPC専用のためモバイルa11yではスキップ');

    const projectName = uniqueProcessName('A11yProject');
    await loginForProcess(page);

    try {
      await page.goto('/#/process');
      await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible({ timeout: 10_000 });
      await expectNoA11yViolations(page, '/#/process');

      await page.goto('/#/process/projects');
      await expect(page.getByRole('heading', { name: 'プロジェクト一覧' })).toBeVisible();
      await expectNoA11yViolations(page, '/#/process/projects');

      await page.goto('/#/process/members');
      await expect(page.getByRole('heading', { name: 'メンバー管理' })).toBeVisible();
      await expectNoA11yViolations(page, '/#/process/members');

      await createProcessProject(page, projectName);
      await openProcessProjectBoard(page, projectName);
      await expectNoA11yViolations(page, '/#/process/projects/:id/board');
    } finally {
      await deleteProcessProject(page, projectName);
    }
  });
});
