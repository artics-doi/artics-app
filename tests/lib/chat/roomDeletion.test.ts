import { describe, expect, test } from 'vitest';
import { canDeleteChatRoom, getRoomCreatorId } from '../../../src/lib/chat/roomDeletion';
import type { ChatRoom } from '../../../src/types';

function room(partial: Partial<ChatRoom> = {}): ChatRoom {
  return {
    id: 'room1',
    name: '開発',
    type: 'group',
    members: ['creator', 'member'],
    memberDetails: {},
    lastMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe('room deletion permissions', () => {
  test('明示された作成者を優先する', () => {
    expect(getRoomCreatorId(room({ createdBy: 'owner' }))).toBe('owner');
  });

  test('旧ルームは先頭メンバーを作成者として扱う', () => {
    expect(getRoomCreatorId(room({ createdBy: undefined }))).toBe('creator');
  });

  test('direct/groupは参加者なら誰でも削除できる', () => {
    expect(canDeleteChatRoom(room(), 'creator')).toBe(true);
    expect(canDeleteChatRoom(room(), 'member')).toBe(true);
    expect(canDeleteChatRoom(room({ type: 'direct' }), 'member')).toBe(true);
  });

  test('非参加者は管理者かどうかにかかわらず削除できず、メモも削除できない', () => {
    expect(canDeleteChatRoom(room(), 'admin')).toBe(false);
    expect(canDeleteChatRoom(room({ type: 'memo' }), 'creator')).toBe(false);
  });
});
