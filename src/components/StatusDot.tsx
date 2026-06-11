import styles from './StatusDot.module.css';

interface StatusDotProps {
  isOnline: boolean;
  size?: 'sm' | 'md';
  /** M-33: 最終ログイン時刻（Unix timestamp ms）。指定された場合、オフライン時にホバーで表示 */
  lastSeen?: number;
}

function formatLastSeen(ts: number): string {
  const now = Date.now();
  const diffMs = now - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}日前`;
  const date = new Date(ts);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export function StatusDot({ isOnline, size = 'md', lastSeen }: StatusDotProps) {
  const tooltip = (() => {
    if (isOnline) return 'オンライン';
    if (lastSeen) return `最終ログイン: ${formatLastSeen(lastSeen)}`;
    return 'オフライン';
  })();

  return (
    <span
      className={`${styles.statusDot} ${styles[size]} ${isOnline ? styles.online : styles.offline}`}
      aria-label={tooltip}
      title={tooltip}
    />
  );
}
