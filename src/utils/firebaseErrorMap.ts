// L-33: Firebase Auth エラーメッセージの日本語マッピング集約
//
// 各ページに散らばっているエラー処理を一元化。
// 知らないエラーコードは英文のまま返す（デバッグ性を保つ）。

const FIREBASE_AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'このメールアドレスは既に使用されています',
  'auth/invalid-email': 'メールアドレスの形式が正しくありません',
  'auth/user-not-found': 'このメールアドレスは登録されていません',
  'auth/wrong-password': 'パスワードが正しくありません',
  'auth/invalid-credential': 'メールアドレスまたはパスワードが正しくありません',
  'auth/weak-password': 'パスワードが弱すぎます。6文字以上で設定してください',
  'auth/operation-not-allowed': 'この認証方法は無効化されています',
  'auth/network-request-failed': 'ネットワークエラーが発生しました。接続をご確認ください',
  // L-34: 連続失敗時の対応
  'auth/too-many-requests': 'ログイン試行回数が多すぎます。しばらく時間をおいてから再度お試しください',
  'auth/user-disabled': 'このアカウントは無効化されています',
  'auth/requires-recent-login': 'セキュリティのため、再度ログインが必要です',
};

/**
 * Firebase Auth エラーから日本語メッセージを取得する。
 *
 * @param error catch で受け取った unknown 値
 * @param fallback 知らないコードのときに使うメッセージ
 */
export function translateFirebaseAuthError(
  error: unknown,
  fallback = '認証に失敗しました。もう一度お試しください。',
): string {
  if (!error) return fallback;
  const code = (error as { code?: string })?.code;
  if (typeof code === 'string' && FIREBASE_AUTH_ERROR_MESSAGES[code]) {
    return FIREBASE_AUTH_ERROR_MESSAGES[code];
  }
  // 開発時のデバッグ用に英文 message も併記したい場合は、呼び出し側で error 自体を console.log する
  return fallback;
}

/**
 * エラーコードを取得（既知のものに限る）
 */
export function getFirebaseAuthErrorCode(error: unknown): string | null {
  if (!error) return null;
  const code = (error as { code?: string })?.code;
  if (typeof code === 'string' && FIREBASE_AUTH_ERROR_MESSAGES[code]) {
    return code;
  }
  return null;
}
