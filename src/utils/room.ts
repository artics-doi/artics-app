import type { ChatRoom, User } from '../types';

const LOCAL_READ_STATE_KEY_PREFIX = 'artics:room-read:v1:';

function getLocalReadStates(currentUserId: string): Record<string, number> {
  if (typeof window === 'undefined') return {};

  try {
    const stored = window.localStorage.getItem(`${LOCAL_READ_STATE_KEY_PREFIX}${currentUserId}`);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1])
      ),
    );
  } catch {
    return {};
  }
}

export function markRoomLocallyRead(roomId: string, currentUserId: string, readAt = Date.now()): void {
  if (typeof window === 'undefined') return;

  try {
    const readStates = getLocalReadStates(currentUserId);
    readStates[roomId] = Math.max(readStates[roomId] ?? 0, readAt);
    window.localStorage.setItem(
      `${LOCAL_READ_STATE_KEY_PREFIX}${currentUserId}`,
      JSON.stringify(readStates),
    );
  } catch {
    // localStorage が無効でもサーバー側の既読処理は継続する。
  }
}

export function getDirectRoomKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join('__');
}

export function getDirectRoomId(userIdA: string, userIdB: string): string {
  return `direct_${getDirectRoomKey(userIdA, userIdB)}`;
}

export function isDirectRoomForUsers(
  room: { type?: unknown; members?: unknown },
  userIdA: string,
  userIdB: string,
): boolean {
  return room.type === 'direct' &&
    Array.isArray(room.members) &&
    room.members.includes(userIdA) &&
    room.members.includes(userIdB);
}

export function getRoomDisplayName(room: ChatRoom, currentUserId?: string | null): string {
  if (room.type === 'memo') {
    return 'メモ';
  }

  if (room.type === 'group') {
    return room.name;
  }

  const otherUserId = room.members.find((id) => id !== currentUserId) ?? room.members[0];
  if (otherUserId && room.memberDetails[otherUserId]) {
    return room.memberDetails[otherUserId].displayName;
  }

  return 'Unknown';
}

// Cloud Functions が管理する unreadCounts フィールドから自分の未読数を取得
export function getUnreadCount(
  room: ChatRoom,
  currentUserId?: string | null,
  activeRoomId?: string | null,
): number {
  if (!currentUserId) return 0;
  if (room.id === activeRoomId) return 0;

  const serverUnreadCount = room.unreadCounts?.[currentUserId] ?? 0;
  if (serverUnreadCount <= 0) return 0;

  const lastMessageAt = room.lastMessage?.timestamp?.getTime();
  const locallyReadAt = getLocalReadStates(currentUserId)[room.id];
  if (lastMessageAt !== undefined && locallyReadAt !== undefined && locallyReadAt >= lastMessageAt) {
    return 0;
  }

  return serverUnreadCount;
}

export function getDirectRoomPeerId(room: ChatRoom, currentUserId?: string | null): string | null {
  if (room.type !== 'direct') return null;
  return room.members.find((id) => id !== currentUserId) ?? room.members[0] ?? null;
}

export function getRoomAvatarUrl(
  room: ChatRoom,
  currentUserId?: string | null,
  users: User[] = [],
): string | null {
  if (room.type !== 'direct') {
    return room.photoURL ?? null;
  }

  const peerId = getDirectRoomPeerId(room, currentUserId);
  if (!peerId) return null;

  const latestUserPhoto = users.find((user) => user.uid === peerId)?.photoURL;
  return latestUserPhoto ?? room.memberDetails?.[peerId]?.photoURL ?? null;
}

export function getRoomAvatarLabel(
  room: ChatRoom,
  currentUserId?: string | null,
  users: User[] = [],
): string {
  if (room.type === 'group') return 'G';
  if (room.type === 'memo') return 'M';

  const peerId = getDirectRoomPeerId(room, currentUserId);
  const name = peerId
    ? users.find((user) => user.uid === peerId)?.displayName ??
      room.memberDetails?.[peerId]?.displayName ??
      getRoomDisplayName(room, currentUserId)
    : getRoomDisplayName(room, currentUserId);

  return name.trim().slice(0, 1).toUpperCase() || 'U';
}
