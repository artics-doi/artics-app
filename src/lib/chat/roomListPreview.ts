// ホーム画面のチャット一覧に出す「時刻」と「本文プレビュー」の純ロジック。
//
// スマホ幅では 1 行の高さを詰めるため、表示できる文字数が少ない。
// そのため一覧では以下の方針をとる:
// - 時刻は当日なら HH:mm、前日なら「昨日」、それ以外は日付だけ（秒・時刻は出さない）
// - 1対1 / メモでは相手が自明なので「送信者名: 」の接頭辞を付けない
// - グループでは誰の発言か分からないと困るので接頭辞を付ける（自分の発言は「自分」）
//
// 表示だけの判断で Firestore を触らないため、ここは純関数で閉じる。

export type RoomListRoomType = 'direct' | 'group' | 'memo';

export interface RoomListLastMessage {
  text: string;
  senderId: string;
  senderName: string;
}

export const NO_MESSAGE_LABEL = 'メッセージがありません';

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/**
 * 一覧の右側に出す短い時刻表記を返す。
 * - 当日: `12:02`
 * - 前日: `昨日`
 * - 同じ年: `7/28`
 * - それ以前: `2025/12/31`
 *
 * `now` は引数で受け取り、テストで固定できるようにする。
 */
export function formatRoomListTime(
  date: Date | null | undefined,
  now: Date = new Date(),
): string {
  if (!date || Number.isNaN(date.getTime())) return '';

  if (isSameDay(date, now)) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return '昨日';

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 一覧の 2 行目に出す本文プレビューを返す。
 * グループだけ「送信者名: 」を付け、1対1 / メモでは本文のみにする。
 */
export function formatRoomListPreview(
  lastMessage: RoomListLastMessage | null | undefined,
  roomType: RoomListRoomType,
  currentUserId?: string | null,
): string {
  if (!lastMessage) return NO_MESSAGE_LABEL;

  const text = lastMessage.text ?? '';
  if (roomType !== 'group') return text;

  const isOwn = !!currentUserId && lastMessage.senderId === currentUserId;
  const name = isOwn ? '自分' : (lastMessage.senderName || '不明');
  return `${name}: ${text}`;
}
