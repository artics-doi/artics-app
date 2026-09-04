export const BADGE_MAX_COUNT = 99;

/** タスクバーバッジに描く文字列。0 以下・非有限値は null（バッジ非表示）。 */
export function formatBadgeLabel(count: number): string | null {
  if (!Number.isFinite(count)) return null;
  const n = Math.floor(count);
  if (n <= 0) return null;
  if (n > BADGE_MAX_COUNT) return `${BADGE_MAX_COUNT}+`;
  return String(n);
}

/** app.setBadgeCount 等に渡す正規化済み件数。負数・小数・NaN を 0 以上の整数に丸める。 */
export function normalizeBadgeCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count));
}
