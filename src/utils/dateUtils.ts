export function formatDateLabel(date: Date | undefined): string {
  if (!date) return '';

  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return '今日';
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return '昨日';
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * L-1: 当日/当年/それ以前で分岐する時刻フォーマット
 * - 当日: HH:mm
 * - 当年: M月D日 HH:mm
 * - それ以前: YYYY/M/D HH:mm
 *
 * L-37: タイムゾーン明示のため `Asia/Tokyo` 固定（社内利用前提）
 */
export function formatTimeSmart(date: Date | undefined): string {
  if (!date) return '';
  const now = new Date();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;

  if (date.toDateString() === now.toDateString()) {
    return time;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${time}`;
}
