// Login ページの Page Object
// E2E テスト全体で共通利用するためのラッパー

import type { Page } from '@playwright/test';
import type { TestUser } from '../fixtures/testUsers';

export class LoginPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/#/login');
  }

  async login(user: TestUser): Promise<void> {
    await this.page.getByPlaceholder('example@company.com').fill(user.email);
    await this.page.getByPlaceholder(/パスワード/).first().fill(user.password);
    await this.page.getByRole('button', { name: 'ログイン' }).click();
  }
}
