import type { ChatRoom, User } from '../types';

export function getDirectRoomKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join('__');
}

export function getDirectRoomId(userIdA: string, userIdB: string): string {
  return `direct_${getDirectRoomKey(userIdA, userIdB)}`;
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
