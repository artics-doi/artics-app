import { expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from './LoginPage';
import { PRIMARY_USER } from '../fixtures/testUsers';

export const HAS_E2E_CREDS =
  process.env.E2E_USER_EMAIL !== undefined &&
  process.env.E2E_USER_PASSWORD !== undefined;

export function uniqueProcessName(prefix: string): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `E2E Phase4 ${prefix} ${stamp}`;
}

export function inputDateFromNow(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export async function loginForProcess(page: Page): Promise<void> {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(PRIMARY_USER);
  await expect(page).not.toHaveURL(/#\/login$/, { timeout: 20_000 });
}

export function projectCard(page: Page, projectName: string): Locator {
  return page.getByTestId('process-project-card').filter({ hasText: projectName });
}

export function memberRow(page: Page, memberName: string): Locator {
  return page.getByTestId('process-member-row').filter({ hasText: memberName });
}

export function taskCard(page: Page, taskName: string): Locator {
  return page.getByTestId('process-task-card').filter({ hasText: taskName });
}

export async function createProcessMember(page: Page): Promise<{ memberName: string; created: boolean }> {
  await page.goto('/#/process/members');
  await expect(page.getByRole('heading', { name: 'メンバー管理' })).toBeVisible();
  await page.getByRole('button', { name: 'メンバーを追加' }).click();
  const dialog = page.getByRole('dialog', { name: '新しいメンバー' });
  const enabledUserOption = dialog.locator('[data-testid="process-member-user-option"]:not(:disabled)').first();
  if ((await enabledUserOption.count()) === 0) {
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    const existingRow = page.getByTestId('process-member-row').first();
    await expect(existingRow).toBeVisible({ timeout: 10_000 });
    return {
      memberName: (await existingRow.getAttribute('data-member-name')) ?? '',
      created: false,
    };
  }
  const memberName = (await enabledUserOption.getAttribute('data-user-name')) ?? 'E2E Primary';
  await enabledUserOption.check();
  await dialog.getByRole('button', { name: '作成' }).click();
  await expect(memberRow(page, memberName)).toBeVisible({ timeout: 10_000 });
  return { memberName, created: true };
}

export async function deleteProcessMember(page: Page, memberName: string): Promise<void> {
  await page.goto('/#/process/members');
  const row = memberRow(page, memberName);
  if ((await row.count()) === 0) return;
  await row.getByTestId('process-member-menu-button').click();
  await page.getByTestId('process-member-delete-button').click();
  await page.getByRole('dialog', { name: 'メンバーを削除' }).getByRole('button', { name: '削除する' }).click();
  await expect(row).toHaveCount(0, { timeout: 10_000 });
}

export async function createProcessProject(page: Page, projectName: string): Promise<void> {
  await page.goto('/#/process/projects');
  await expect(page.getByRole('heading', { name: 'プロジェクト一覧' })).toBeVisible();
  await page.getByRole('button', { name: '新規作成' }).click();
  const dialog = page.getByRole('dialog', { name: '新しいプロジェクト' });
  await dialog.getByLabel('プロジェクト名').fill(projectName);
  await dialog.getByLabel('説明（任意）').fill('Phase 4 E2E 自動確認用。');
  await dialog.getByRole('button', { name: '作成' }).click();
  await expect(projectCard(page, projectName)).toBeVisible({ timeout: 10_000 });
}

export async function deleteProcessProject(page: Page, projectName: string): Promise<void> {
  await page.goto('/#/process/projects');
  let card = projectCard(page, projectName);
  if ((await card.count()) === 0) {
    await page.getByRole('tab', { name: 'アーカイブ' }).click();
    card = projectCard(page, projectName);
  }
  if ((await card.count()) === 0) return;
  await card.getByTestId('process-project-menu-button').click();
  await page.getByTestId('process-project-delete-button').click();
  await page.getByRole('dialog', { name: 'プロジェクトを削除' }).getByRole('button', { name: '削除する' }).click();
  await expect(card).toHaveCount(0, { timeout: 15_000 });
}

export async function openProcessProjectBoard(page: Page, projectName: string): Promise<void> {
  await page.goto('/#/process/projects');
  const card = projectCard(page, projectName);
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.click();
  await expect(page.getByTestId('process-board-workspace')).toBeVisible({ timeout: 10_000 });
}

export async function expectNoA11yViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  if (results.violations.length > 0) {
    console.log(`A11y violations on ${label}:`, JSON.stringify(results.violations, null, 2));
  }
  expect(results.violations).toEqual([]);
}
