// E2E テスト用ユーザー情報
//
// セキュリティ: 実 Firebase 環境のためテスト専用アカウントを推奨。
// 環境変数からも読み取れるようにして CI 連携時に切り替え可能。

export interface TestUser {
  email: string;
  password: string;
  displayName: string;
}

const fromEnv = (key: string, fallback: string): string =>
  process.env[key] ?? fallback;

// 開発者がローカルで設定する。コミットしないこと（後で .env.test を gitignore 推奨）。
export const PRIMARY_USER: TestUser = {
  email: fromEnv('E2E_USER_EMAIL', 'e2e-primary@example.com'),
  password: fromEnv('E2E_USER_PASSWORD', 'CHANGE_ME'),
  displayName: fromEnv('E2E_USER_NAME', 'E2E Primary'),
};
