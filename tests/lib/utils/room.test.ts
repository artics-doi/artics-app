import { describe, expect, test } from 'vitest';
import {
  getDirectRoomId,
  getDirectRoomKey,
  getDirectRoomPeerId,
  getRoomAvatarLabel,
  getRoomAvatarUrl,
  getRoomDisplayName,
  getUnreadCount,
} from '../../../src/utils/room';
import type { ChatRoom, User } from '../../../src/types';

function room(partial: Partial<ChatRoom> = {}): ChatRoom {
  return {
    id: 'room1',
    name: '',
    type: 'direct',
    members: ['alice', 'bob'],
    memberDetails: {
      alice: { displayName: 'アリス', photoURL: null },
      bob: { displayName: 'ボブ', photoURL: 'https://example.com/bob.png' },
    },
    lastMessage: null,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    ...partial,
  };
}

function user(partial: Partial<User> = {}): User {
  return {
    uid: 'bob',
    email: 'bob@example.com',
    displayName: 'Bob Latest',
    photoURL: 'https://example.com/bob-latest.png',
    createdAt: new Date(2026, 0, 1),
    ...partial,
  };
}

describe('getDirectRoomKey / getDirectRoomId', () => {
  test('UID をソートして連結する（順序に依存しない）', () => {
    expect(getDirectRoomKey('bob', 'alice')).toBe('alice__bob');
    expect(getDirectRoomKey('alice', 'bob')).toBe('alice__bob');
    expect(getDirectRoomId('bob', 'alice')).toBe('direct_alice__bob');
  });
});

describe('getRoomDisplayName', () => {
  test('メモルームは「メモ」', () => {
    expect(getRoomDisplayName(room({ type: 'memo' }), 'alice')).toBe('メモ');
  });

  test('グループはルーム名', () => {
    expect(getRoomDisplayName(room({ type: 'group', name: '開発チーム' }), 'alice')).toBe('開発チーム');
  });

  test('1対1は相手の displayName', () => {
    expect(getRoomDisplayName(room(), 'alice')).toBe('ボブ');
    expect(getRoomDisplayName(room(), 'bob')).toBe('アリス');
  });

  test('相手の memberDetails がなければ Unknown', () => {
    expect(getRoomDisplayName(room({ memberDetails: {} }), 'alice')).toBe('Unknown');
  });

  test('members に自分しかいなければ自分の詳細にフォールバック', () => {
    const selfOnly = room({
      members: ['alice'],
      memberDetails: { alice: { displayName: 'アリス', photoURL: null } },
    });
    expect(getRoomDisplayName(selfOnly, 'alice')).toBe('アリス');
  });
});

describe('getDirectRoomPeerId', () => {
  test('1対1は相手の UID を返す', () => {
    expect(getDirectRoomPeerId(room(), 'alice')).toBe('bob');
  });

  test('direct 以外は null', () => {
    expect(getDirectRoomPeerId(room({ type: 'group' }), 'alice')).toBeNull();
    expect(getDirectRoomPeerId(room({ type: 'memo' }), 'alice')).toBeNull();
  });
});

describe('getRoomAvatarUrl', () => {
  test('direct 以外はルームの photoURL（なければ null）', () => {
    expect(getRoomAvatarUrl(room({ type: 'group', photoURL: 'https://example.com/g.png' }), 'alice')).toBe(
      'https://example.com/g.png',
    );
    expect(getRoomAvatarUrl(room({ type: 'group' }), 'alice')).toBeNull();
  });

  test('1対1は users の最新写真が memberDetails より優先される', () => {
    expect(getRoomAvatarUrl(room(), 'alice', [user()])).toBe('https://example.com/bob-latest.png');
  });

  test('users に相手がいなければ memberDetails の写真にフォールバック', () => {
    expect(getRoomAvatarUrl(room(), 'alice', [])).toBe('https://example.com/bob.png');
  });

  test('どちらにも写真がなければ null', () => {
    const noPhoto = room({
      memberDetails: {
        alice: { displayName: 'アリス', photoURL: null },
        bob: { displayName: 'ボブ', photoURL: null },
      },
    });
    expect(getRoomAvatarUrl(noPhoto, 'alice', [])).toBeNull();
  });
});

describe('getUnreadCount', () => {
  test('unreadCounts から自分の未読数を返す', () => {
    expect(getUnreadCount(room({ unreadCounts: { alice: 3, bob: 1 } }), 'alice')).toBe(3);
  });

  test('未読エントリがなければ 0', () => {
    expect(getUnreadCount(room({ unreadCounts: { bob: 1 } }), 'alice')).toBe(0);
    expect(getUnreadCount(room(), 'alice')).toBe(0);
  });

  test('ユーザー未指定（undefined/null/空文字）は 0', () => {
    expect(getUnreadCount(room({ unreadCounts: { alice: 3 } }), undefined)).toBe(0);
    expect(getUnreadCount(room({ unreadCounts: { alice: 3 } }), null)).toBe(0);
    expect(getUnreadCount(room({ unreadCounts: { alice: 3 } }), '')).toBe(0);
  });
});

describe('getRoomAvatarLabel', () => {
  test('グループは G、メモは M', () => {
    expect(getRoomAvatarLabel(room({ type: 'group', name: '開発' }), 'alice')).toBe('G');
    expect(getRoomAvatarLabel(room({ type: 'memo' }), 'alice')).toBe('M');
  });

  test('1対1は相手名の先頭1文字（大文字化）', () => {
    expect(getRoomAvatarLabel(room(), 'alice')).toBe('ボ');
    const en = room({
      memberDetails: {
        alice: { displayName: 'アリス', photoURL: null },
        bob: { displayName: 'bob smith', photoURL: null },
      },
    });
    expect(getRoomAvatarLabel(en, 'alice')).toBe('B');
  });

  test('users の最新 displayName が memberDetails より優先される', () => {
    expect(getRoomAvatarLabel(room(), 'alice', [user({ displayName: 'zed' })])).toBe('Z');
  });

  test('名前が空白のみなら U', () => {
    const blank = room({
      memberDetails: {
        alice: { displayName: 'アリス', photoURL: null },
        bob: { displayName: '  ', photoURL: null },
      },
    });
    expect(getRoomAvatarLabel(blank, 'alice')).toBe('U');
  });
});
