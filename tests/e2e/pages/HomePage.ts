// Home ページの Page Object

import type { Page } from '@playwright/test';

export class HomePage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async waitForReady(): Promise<void> {
    // ヘッダー or チャット作成ボタンの出現を待機
    await this.page.waitForURL(/\/#\/$/);
    await this.page.getByRole('button', { name: /チャット作成|設定/ }).first().waitFor({ state: 'visible' });
  }

  async openSettings(): Promise<void> {
    await this.page.getByRole('button', { name: '設定' }).click();
  }

  async logout(): Promise<void> {
    await this.openSettings();
    await this.page.getByRole('button', { name: 'ログアウト' }).click();
  }
}
