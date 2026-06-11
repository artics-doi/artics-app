import { describe, expect, test } from 'vitest';
import { getReactionEntries, hasUserReacted } from '../../../src/lib/chat/reactions';
import type { ExtendedMessage } from '../../../src/types';

function message(partial: Partial<ExtendedMessage> = {}): ExtendedMessage {
  return {
    id: 'm1',
    chatRoomId: 'room1',
    senderId: 'alice',
    senderName: 'アリス',
    senderPhotoURL: null,
    text: 'こんにちは',
    imageURL: null,
    fileURL: null,
    fileName: null,
    fileType: null,
    readBy: [],
    createdAt: new Date(2026, 5, 11),
    ...partial,
  };
}

describe('getReactionEntries', () => {
  test('reactionsByUser を絵文字ごとのユーザー一覧に集約する', () => {
    const m = message({
      reactionsByUser: {
        alice: ['👍', '🎉'],
        bob: ['👍'],
      },
    });
    const entries = getReactionEntries(m);
    const map = new Map(entries);
    expect(map.get('👍')).toEqual(expect.arrayContaining(['alice', 'bob']));
    expect(map.get('👍')).toHaveLength(2);
    expect(map.get('🎉')).toEqual(['alice']);
  });

  test('同一ユーザーの重複絵文字は1件に正規化される', () => {
    const m = message({ reactionsByUser: { alice: ['👍', '👍'] } });
    expect(getReactionEntries(m)).toEqual([['👍', ['alice']]]);
  });

  test('旧形式 reactions フィールドは読まない', () => {
    const m = message({ reactions: { '👍': ['alice', 'bob'] } });
    expect(getReactionEntries(m)).toEqual([]);
  });

  test('reactionsByUser がなければ空配列', () => {
    expect(getReactionEntries(message())).toEqual([]);
  });
});

describe('hasUserReacted', () => {
  const m = message({ reactionsByUser: { alice: ['👍'] } });

  test('該当ユーザーが該当絵文字でリアクション済みなら true', () => {
    expect(hasUserReacted(m, '👍', 'alice')).toBe(true);
  });

  test('絵文字違い・ユーザー違い・uid 未指定は false', () => {
    expect(hasUserReacted(m, '🎉', 'alice')).toBe(false);
    expect(hasUserReacted(m, '👍', 'bob')).toBe(false);
    expect(hasUserReacted(m, '👍', undefined)).toBe(false);
  });
});
