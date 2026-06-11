// 新規登録ページ

import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PasswordInput from '../components/PasswordInput';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import { evaluatePasswordStrength } from '../utils/passwordStrength';
import { translateFirebaseAuthError } from '../utils/firebaseErrorMap';
import { getAppEntryPath } from '../utils/navigation';
import styles from './Login.module.css';

export default function Register() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  // M-27: 確認パスワードのリアルタイム判定
  const confirmStatus = useMemo<'idle' | 'match' | 'mismatch'>(() => {
    if (!confirmPassword) return 'idle';
    return confirmPassword === password ? 'match' : 'mismatch';
  }, [password, confirmPassword]);

  // M-26: 強度判定
  const passwordEval = useMemo(() => evaluatePasswordStrength(password), [password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // バリデーション
    if (!displayName || !email || !password || !confirmPassword) {
      setError('すべての項目を入力してください');
      return;
    }

    if (password !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください');
      return;
    }

    try {
      setError('');
      setLoading(true);
      await register(email, password, displayName);
      navigate(getAppEntryPath());
    } catch (err: unknown) {
      console.error(err);
      // L-33: 集約マッピングで翻訳
      setError(translateFirebaseAuthError(err, '登録に失敗しました。もう一度お試しください。'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>社内チャット</h1>
        <p className={styles.subtitle}>新規登録</p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="displayName">表示名</label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="山田 太郎"
              disabled={loading}
              autoComplete="name"
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="email">メールアドレス</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@company.com"
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">パスワード</label>
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              placeholder="6文字以上"
              disabled={loading}
              autoComplete="new-password"
              ariaDescribedBy="password-strength-meter"
            />
            <PasswordStrengthMeter password={password} id="password-strength-meter" />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="confirmPassword">パスワード（確認）</label>
            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="パスワードを再入力"
              disabled={loading}
              autoComplete="new-password"
              ariaInvalid={confirmStatus === 'mismatch'}
              ariaDescribedBy="confirm-status"
            />
            {confirmStatus !== 'idle' && (
              <p
                id="confirm-status"
                className={confirmStatus === 'match' ? styles.confirmMatch : styles.confirmMismatch}
                aria-live="polite"
              >
                {confirmStatus === 'match' ? '✓ パスワードが一致しています' : '✗ パスワードが一致しません'}
              </p>
            )}
          </div>

          <button
            type="submit"
            className={styles.button}
            disabled={loading || confirmStatus === 'mismatch' || passwordEval.strength === 'none'}
          >
            {loading ? '登録中...' : '登録する'}
          </button>
        </form>

        <p className={styles.linkText}>
          既にアカウントをお持ちの方は
          <Link to="/login" className={styles.link}>ログイン</Link>
        </p>
      </div>
    </div>
  );
}
