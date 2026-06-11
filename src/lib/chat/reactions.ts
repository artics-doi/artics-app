// メッセージのリアクション集計の純ロジック。Chat.tsx から機械的に移動（挙動変更なし）。

import type { ExtendedMessage } from '../../types';

export function getReactionEntries(message: ExtendedMessage): Array<[string, string[]]> {
  const reactionUsersByEmoji = new Map<string, Set<string>>();

  // 旧形式 message.reactions は読まない。表示だけして取り消しはできない
  // 矛盾状態になるため（取り消しは reactionsByUser しか更新できず、
  // セキュリティルール上も reactions の変更は許可されていない）
  Object.entries(message.reactionsByUser || {}).forEach(([uid, emojis]) => {
    emojis.forEach((emoji) => {
      const users = reactionUsersByEmoji.get(emoji) ?? new Set<string>();
      users.add(uid);
      reactionUsersByEmoji.set(emoji, users);
    });
  });

  return Array.from(reactionUsersByEmoji.entries())
    .map(([emoji, users]) => [emoji, Array.from(users)] as [string, string[]])
    .filter(([, users]) => users.length > 0);
}

export function hasUserReacted(message: ExtendedMessage, emoji: string, uid: string | undefined): boolean {
  if (!uid) return false;
  return getReactionEntries(message).some(
    ([entryEmoji, userIds]) => entryEmoji === emoji && userIds.includes(uid),
  );
}
