import { describe, expect, test } from 'vitest';
import { createScheduleFormFromMessage, createTaskInputFromMessage, messageToTitle } from '../../../src/lib/chat/createFromMessage';
import type { ExtendedMessage } from '../../../src/types';

function message(partial: Partial<ExtendedMessage> = {}): ExtendedMessage {
  return {
    id: 'm1',
    chatRoomId: 'room1',
    senderId: 'u1',
    senderName: '土居',
    senderPhotoURL: null,
    text: '明日の定例会議の準備をお願いします',
    imageURL: null,
    fileURL: null,
    fileName: null,
    fileType: null,
    readBy: [],
    createdAt: new Date(2026, 5, 11, 9, 30),
    ...partial,
  };
}

describe('messageToTitle', () => {
  test('空白を詰め、長い本文をタイトル向けに短縮する', () => {
    expect(messageToTitle('  会議\n\n資料   確認  ')).toBe('会議 資料 確認');
    expect(messageToTitle('a'.repeat(90))).toHaveLength(80);
  });
});

describe('createScheduleFormFromMessage', () => {
  test('本文をタイトルとメモに引き継ぐ', () => {
    const form = createScheduleFormFromMessage(message(), new Date(2026, 5, 12));
    expect(form.title).toBe('明日の定例会議の準備をお願いします');
    expect(form.memo).toBe('明日の定例会議の準備をお願いします');
    expect(form.categoryId).toBe('');
    expect(form.targetUserIds).toEqual([]);
    expect(form.startDate).toBe('2026-06-12');
  });
});

describe('createTaskInputFromMessage', () => {
  test('本文、送信者、送信日時、元チャット参照を説明に入れる', () => {
    const input = createTaskInputFromMessage(message(), 'todo');
    expect(input.title).toBe('明日の定例会議の準備をお願いします');
    expect(input.columnId).toBe('todo');
    expect(input.assigneeIds).toEqual([]);
    expect(input.startDate).toBeNull();
    expect(input.endDate).toBeNull();
    expect(input.completedDate).toBeNull();
    expect(input.completionChecked).toBe(false);
    expect(input.description).toContain('送信者: 土居');
    expect(input.description).toContain('送信日時: 2026/6/11 09:30');
    expect(input.description).toContain('元チャット: /chat/room1?messageId=m1');
  });
});
