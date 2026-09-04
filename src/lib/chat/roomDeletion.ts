import type { ChatRoom } from '../../types';

export function getRoomCreatorId(room: Pick<ChatRoom, 'createdBy' | 'members'>): string | null {
  const explicitCreator = room.createdBy?.trim();
  if (explicitCreator) return explicitCreator;
  return room.members[0] ?? null;
}

export function canDeleteChatRoom(
  room: Pick<ChatRoom, 'type' | 'members'>,
  currentUserId: string | null | undefined,
): boolean {
  if (room.type === 'memo') return false;
  return Boolean(currentUserId && room.members.includes(currentUserId));
}
