// ログインページ

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import styles from './Login.module.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  // パスワードリセットメール送信
  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();

    if (!resetEmail) {
      setResetError('メールアドレスを入力してください');
      return;
    }

    try {
      setResetError('');
      setResetMessage('');
      setResetLoading(true);
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMessage('パスワードリセット用のメールを送信しました。メールをご確認ください。');
      setResetEmail('');
    } catch (err: unknown) {
      console.error(err);
      const errorCode = (err as { code?: string })?.code;
      if (errorCode === 'auth/user-not-found') {
        setResetError('このメールアドレスは登録されていません');
      } else if (errorCode === 'auth/invalid-email') {
        setResetError('メールアドレスの形式が正しくありません');
      } else {
        setResetError('メール送信に失敗しました。もう一度お試しください。');
      }
    } finally {
      setResetLoading(false);
    }
  }

  // モーダルを開く
  function openResetModal() {
    setResetEmail(email); // 入力済みのメールアドレスを引き継ぐ
    setResetError('');
    setResetMessage('');
    setShowResetModal(true);
  }

  // モーダルを閉じる
  function closeResetModal() {
    setShowResetModal(false);
    setResetEmail('');
    setResetError('');
    setResetMessage('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }

    try {
      setError('');
      setLoading(true);
      await login(email, password);
      navigate('/');
    } catch (err) {
      console.error(err);
      setError('ログインに失敗しました。メールアドレスとパスワードを確認してください。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>社内チャット</h1>
        <p className={styles.subtitle}>ログイン</p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="email">メールアドレス</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@company.com"
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">パスワード</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワード"
              disabled={loading}
            />
          </div>

          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <p className={styles.forgotPassword}>
          <button type="button" className={styles.forgotLink} onClick={openResetModal}>
            パスワードを忘れた方
          </button>
        </p>

        <p className={styles.linkText}>
          アカウントをお持ちでない方は
          <Link to="/register" className={styles.link}>新規登録</Link>
        </p>
      </div>

      {/* パスワードリセットモーダル */}
      {showResetModal && (
        <div className={styles.modalOverlay} onClick={closeResetModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>パスワードリセット</h2>
            <p className={styles.modalDescription}>
              登録されているメールアドレスを入力してください。<br />
              パスワードリセット用のリンクをお送りします。
            </p>

            {resetError && <div className={styles.error}>{resetError}</div>}
            {resetMessage && <div className={styles.success}>{resetMessage}</div>}

            <form onSubmit={handlePasswordReset} className={styles.modalForm}>
              <div className={styles.inputGroup}>
                <label htmlFor="resetEmail">メールアドレス</label>
                <input
                  type="email"
                  id="resetEmail"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="example@company.com"
                  disabled={resetLoading}
                />
              </div>

              <div className={styles.modalButtons}>
                <button
                  type="submit"
                  className={styles.button}
                  disabled={resetLoading}
                >
                  {resetLoading ? '送信中...' : 'リセットメールを送信'}
                </button>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeResetModal}
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
