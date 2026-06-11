// M-26: パスワード強度バー（4 段階）

import { evaluatePasswordStrength } from '../utils/passwordStrength';
import styles from './PasswordStrengthMeter.module.css';

interface Props {
  password: string;
  /** 説明文を画面に出すか（aria-describedby と紐付ける場合） */
  id?: string;
}

export default function PasswordStrengthMeter({ password, id }: Props) {
  const { strength, score, label, hint } = evaluatePasswordStrength(password);

  if (!password) return null;

  return (
    <div className={styles.wrapper} id={id} aria-live="polite">
      <div className={styles.barTrack}>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`${styles.barSegment} ${i <= score ? styles[`barSegment_${strength}`] : ''}`}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className={styles.meta}>
        <span className={`${styles.label} ${styles[`label_${strength}`]}`}>{label}</span>
        <span className={styles.hint}>{hint}</span>
      </div>
    </div>
  );
}
