import { describe, expect, test, vi } from 'vitest';
import {
  getDirectRoomId,
  getDirectRoomKey,
  getDirectRoomPeerId,
  isDirectRoomForUsers,
  getRoomAvatarLabel,
  getRoomAvatarUrl,
  getRoomDisplayName,
  getUnreadCount,
  markRoomLocallyRead,
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

describe('isDirectRoomForUsers', () => {
  test('順序に関係なく両方の参加者がいる1対1ルームだけを認識する', () => {
    expect(isDirectRoomForUsers({ type: 'direct', members: ['bob', 'alice'] }, 'alice', 'bob')).toBe(true);
    expect(isDirectRoomForUsers({ type: 'group', members: ['alice', 'bob'] }, 'alice', 'bob')).toBe(false);
    expect(isDirectRoomForUsers({ type: 'direct', members: ['alice'] }, 'alice', 'bob')).toBe(false);
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
  test('表示中のルームはサーバー反映待ちでも未読0を返す', () => {
    expect(getUnreadCount(room({ id: 'room1', unreadCounts: { alice: 2 } }), 'alice', 'room1')).toBe(0);
  });

  test('端末で既読にした後は新着があるまで未読0を返す', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    try {
      markRoomLocallyRead('room1', 'alice', 2_000);
      expect(getUnreadCount(room({
        id: 'room1',
        unreadCounts: { alice: 2 },
        lastMessage: { text: 'old', senderId: 'bob', senderName: 'Bob', timestamp: new Date(1_000) },
      }), 'alice')).toBe(0);
      expect(getUnreadCount(room({
        id: 'room1',
        unreadCounts: { alice: 1 },
        lastMessage: { text: 'new', senderId: 'bob', senderName: 'Bob', timestamp: new Date(3_000) },
      }), 'alice')).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('端末の既読データが破損していてもサーバー未読数へ安全に戻る', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => '{broken-json',
        setItem: () => undefined,
      },
    });

    try {
      expect(getUnreadCount(room({ unreadCounts: { alice: 2 } }), 'alice')).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('端末ストレージへの書き込みが拒否されても既読処理を例外終了しない', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => { throw new Error('storage disabled'); },
      },
    });

    try {
      expect(() => markRoomLocallyRead('room1', 'alice', 2_000)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
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
