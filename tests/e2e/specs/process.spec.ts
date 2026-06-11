import { test, expect } from '@playwright/test';
import {
  HAS_E2E_CREDS,
  createProcessMember,
  createProcessProject,
  deleteProcessMember,
  deleteProcessProject,
  inputDateFromNow,
  loginForProcess,
  openProcessProjectBoard,
  taskCard,
  uniqueProcessName,
} from '../pages/ProcessPage';

test.describe('process: Phase 4 工程管理E2E', () => {
  test.skip(!HAS_E2E_CREDS, 'E2E_USER_EMAIL / E2E_USER_PASSWORD 未設定のためスキップ');

  test('専用データでプロジェクト・メンバー・タスク・ガント表示を確認してクリーンアップする', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('mobile'), '工程管理はPC専用のためモバイルE2Eではスキップ');

    const projectName = uniqueProcessName('Project');
    let memberName = '';
    let createdMember = false;
    const taskName = uniqueProcessName('Task');
    const missingTaskName = uniqueProcessName('Missing Task');
    const copiedTaskName = `${taskName} のコピー`;
    const startDate = inputDateFromNow(1);
    const endDate = inputDateFromNow(3);

    await loginForProcess(page);

    try {
      const memberResult = await createProcessMember(page);
      memberName = memberResult.memberName;
      createdMember = memberResult.created;
      await createProcessProject(page, projectName);
      await openProcessProjectBoard(page, projectName);

      await page.getByRole('button', { name: 'タスク' }).click();
      const createTaskDialog = page.getByRole('dialog', { name: '新しいタスク' });
      await createTaskDialog.getByLabel('タイトル').fill(taskName);
      await createTaskDialog.getByRole('button', { name: memberName }).click();
      await createTaskDialog.getByLabel('開始日').fill(startDate);
      await createTaskDialog.getByLabel('終了日').fill(endDate);
      await createTaskDialog.getByLabel('説明（任意）').fill('E2E 詳細1\nE2E 詳細2');
      await createTaskDialog.getByRole('button', { name: '作成' }).click();

      const createdCard = taskCard(page, taskName);
      await expect(createdCard).toBeVisible({ timeout: 10_000 });
      await expect(createdCard).toContainText(`${startDate} - ${endDate}`);
      await expect(createdCard).toContainText('E2E 詳細1');
      await expect(createdCard).toContainText('E2E 詳細2');
      await expect(createdCard).not.toContainText('遅延');
      await expect(page.getByRole('row').filter({ hasText: taskName })).toBeVisible({ timeout: 10_000 });

      await page.getByRole('button', { name: 'タスク' }).click();
      const missingTaskDialog = page.getByRole('dialog', { name: '新しいタスク' });
      await missingTaskDialog.getByLabel('タイトル').fill(missingTaskName);
      await missingTaskDialog.getByLabel('説明（任意）').fill('未設定チェック用');
      await missingTaskDialog.getByRole('button', { name: '作成' }).click();

      const missingCard = taskCard(page, missingTaskName);
      await expect(missingCard).toBeVisible({ timeout: 10_000 });
      await expect(missingCard).toContainText('担当未設定');
      await expect(missingCard).toContainText('開始未設定');
      await expect(missingCard).toContainText('終了未設定');

      await page.getByLabel('タスク検索').fill('E2E 詳細2');
      await expect(createdCard).toBeVisible();
      await expect(taskCard(page, missingTaskName)).toHaveCount(0);
      await page.getByRole('button', { name: 'クリア' }).click();
      await expect(missingCard).toBeVisible();

      await page.getByLabel('担当者').selectOption('unassigned');
      await expect(missingCard).toBeVisible();
      await expect(taskCard(page, taskName)).toHaveCount(0);
      await page.getByLabel('担当者').selectOption('all');

      await page.getByLabel('日付').selectOption('missing');
      await expect(missingCard).toBeVisible();
      await expect(taskCard(page, taskName)).toHaveCount(0);
      await page.getByLabel('日付').selectOption('all');

      await page.getByLabel('未設定のみ').check();
      await expect(missingCard).toBeVisible();
      await expect(taskCard(page, taskName)).toHaveCount(0);
      await page.getByRole('button', { name: 'クリア' }).click();
      await expect(createdCard).toBeVisible();

      await createdCard.click();
      const editTaskDialog = page.getByRole('dialog', { name: 'タスクを編集' });
      await editTaskDialog.getByLabel('ステータス（列）').selectOption({ label: '進行中' });
      await editTaskDialog.getByRole('button', { name: '保存' }).click();
      await expect(page.getByRole('row').filter({ hasText: taskName }).filter({ hasText: '進行中' })).toBeVisible({
        timeout: 10_000,
      });

      await page.getByRole('button', { name: '表示・並び順' }).click();
      const viewDialog = page.getByRole('dialog', { name: '表示・並び順' });
      await expect(viewDialog.getByText('未着手順')).toBeVisible();
      await expect(viewDialog.getByText('開始日が近い順')).toBeVisible();
      await expect(viewDialog.getByText('終了日が近い順')).toBeVisible();
      await expect(viewDialog.getByText('担当者順')).toBeVisible();
      await expect(viewDialog.getByText('ステータス順')).toBeVisible();
      await expect(viewDialog.getByText('手動', { exact: true })).toHaveCount(0);

      await viewDialog.locator('label:has(input[type="checkbox"])', { hasText: '進行中' }).click();
      await viewDialog.getByRole('button', { name: '適用' }).click();
      await expect(page.getByRole('row').filter({ hasText: taskName })).toHaveCount(0, { timeout: 10_000 });

      await page.getByRole('button', { name: '表示・並び順' }).click();
      const resetDialog = page.getByRole('dialog', { name: '表示・並び順' });
      await resetDialog.getByRole('button', { name: 'リセット' }).click();
      await resetDialog.getByRole('button', { name: '適用' }).click();
      await expect(page.getByRole('row').filter({ hasText: taskName })).toBeVisible({ timeout: 10_000 });

      await taskCard(page, taskName).click();
      const duplicateTaskDialog = page.getByRole('dialog', { name: 'タスクを編集' });
      await duplicateTaskDialog.getByRole('button', { name: '複製' }).click();
      await expect(taskCard(page, copiedTaskName)).toBeVisible({ timeout: 10_000 });

      await page.goto('/#/process/projects');
      const summaryCard = page.getByTestId('process-project-card').filter({ hasText: projectName });
      await expect(summaryCard).toBeVisible({ timeout: 10_000 });
      await expect(summaryCard.getByText('未着手 1')).toBeVisible({ timeout: 10_000 });
      await expect(summaryCard.getByText('進行中 2')).toBeVisible();
      await expect(summaryCard.getByText('完了 0')).toBeVisible();
      await expect(summaryCard.getByText('保留 0')).toBeVisible();
      await expect(summaryCard.getByText('Phase 4 E2E 自動確認用。')).toBeVisible();

      await page.getByPlaceholder('プロジェクト名・説明を検索').fill(projectName);
      await expect(page.getByTestId('process-project-card')).toHaveCount(1);
      await page.getByPlaceholder('プロジェクト名・説明を検索').fill('not-found-project-query');
      await expect(page.getByText('該当するプロジェクトはありません。')).toBeVisible();
      await page.getByPlaceholder('プロジェクト名・説明を検索').fill('');

      await page.getByRole('button', { name: 'コンパクト' }).click();
      await expect(page.getByRole('button', { name: 'コンパクト' })).toHaveAttribute('aria-pressed', 'true');
      await expect(summaryCard.getByText('Phase 4 E2E 自動確認用。')).toBeHidden();
      await page.reload();
      await expect(page.getByRole('button', { name: 'コンパクト' })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: '標準' }).click();

      await page.goto('/#/process');
      await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
      await page.getByRole('button', { name: '月' }).click();
      await page.reload();
      await expect(page.getByRole('button', { name: '月' })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: '週' }).click();
      await page.getByRole('button', { name: taskName }).first().click();
      await expect(page).toHaveURL(/#\/process\/projects\/.+\/board$/);
      const dashboardEditDialog = page.getByRole('dialog', { name: 'タスクを編集' });
      await expect(dashboardEditDialog).toBeHidden();

      await page.goto('/#/process/effort-report');
      await expect(page.getByRole('heading', { name: '年度工数' })).toBeVisible();
      await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: 'PDFをダウンロード' })).toBeVisible();

      await openProcessProjectBoard(page, projectName);

      const scrollState = await page.locator('[data-testid="process-board-workspace"]').evaluate((workspace) => {
        const chart = workspace.querySelector('.wx-chart');
        const gantt = workspace.querySelector('.wx-gantt');
        const proxy = workspace.querySelector('[data-testid="process-gantt-horizontal-scroll"]');
        return {
          chartOverflowX: chart ? getComputedStyle(chart).overflowX : null,
          ganttOverflowX: gantt ? getComputedStyle(gantt).overflowX : null,
          proxyDisplay: proxy ? getComputedStyle(proxy).display : null,
          proxyOverflowX: proxy ? getComputedStyle(proxy).overflowX : null,
        };
      });
      expect(scrollState.chartOverflowX).toBe('hidden');
      expect(scrollState.ganttOverflowX).toBe('hidden');
      expect(scrollState.proxyOverflowX).toBe('auto');

      await page.goto('/#/process/projects');
      const activeCard = page.getByTestId('process-project-card').filter({ hasText: projectName });
      await expect(activeCard).toBeVisible({ timeout: 10_000 });
      await activeCard.getByTestId('process-project-menu-button').click();
      await page.getByRole('button', { name: 'アーカイブ' }).click();
      await page.getByRole('tab', { name: 'アーカイブ' }).click();
      await expect(page.getByText('アーカイブ済みプロジェクト')).toBeVisible();
      await expect(page.getByText('カードのメニューから進行中に戻せます。')).toBeVisible();
      const archivedCard = page.getByTestId('process-project-card').filter({ hasText: projectName });
      await expect(archivedCard).toBeVisible({ timeout: 10_000 });
      await archivedCard.getByTestId('process-project-menu-button').click();
      await page.getByRole('button', { name: '進行中に戻す' }).click();
      await page.getByRole('tab', { name: '進行中' }).click();
      await expect(page.getByTestId('process-project-card').filter({ hasText: projectName })).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      if (createdMember && memberName) {
        await deleteProcessMember(page, memberName);
      }
      await deleteProcessProject(page, projectName);
    }
  });
});
