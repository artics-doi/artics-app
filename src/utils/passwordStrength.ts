// M-26: パスワード強度判定
// 4 段階（none / weak / medium / strong）で評価する。
// - 6 文字未満: 'none'
// - 6 文字以上で英字 OR 数字のみ: 'weak'
// - 8 文字以上で英字 AND 数字: 'medium'
// - 10 文字以上で英字 AND 数字 AND 記号: 'strong'

export type PasswordStrength = 'none' | 'weak' | 'medium' | 'strong';

export interface PasswordStrengthResult {
  strength: PasswordStrength;
  /** 0〜4 のスコア。プログレスバーで使用 */
  score: number;
  /** UI 表示用ラベル */
  label: string;
  /** UI 表示用ヒント */
  hint: string;
}

const LABELS: Record<PasswordStrength, string> = {
  none: '未入力',
  weak: '弱い',
  medium: '普通',
  strong: '強い',
};

const HINTS: Record<PasswordStrength, string> = {
  none: '6 文字以上で入力してください',
  weak: '英字と数字を組み合わせるとより強くなります',
  medium: '記号（!@#$ など）を加えるとさらに強くなります',
  strong: '強いパスワードです',
};

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return { strength: 'none', score: 0, label: LABELS.none, hint: HINTS.none };
  }

  const length = password.length;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  // 記号: 一般的なキーボード記号
  const hasSymbol = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password);

  if (length < 6) {
    return { strength: 'none', score: 1, label: LABELS.none, hint: HINTS.none };
  }

  if (length >= 10 && hasLetter && hasNumber && hasSymbol) {
    return { strength: 'strong', score: 4, label: LABELS.strong, hint: HINTS.strong };
  }

  if (length >= 8 && hasLetter && hasNumber) {
    return { strength: 'medium', score: 3, label: LABELS.medium, hint: HINTS.medium };
  }

  return { strength: 'weak', score: 2, label: LABELS.weak, hint: HINTS.weak };
}
