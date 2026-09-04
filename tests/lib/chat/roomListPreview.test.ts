import { describe, expect, it } from 'vitest';
import {
  NO_MESSAGE_LABEL,
  formatRoomListPreview,
  formatRoomListTime,
} from '../../../src/lib/chat/roomListPreview';

// 基準時刻を固定する（2026-07-30 15:30）
const NOW = new Date(2026, 6, 30, 15, 30, 0);

describe('formatRoomListTime', () => {
  it('当日は HH:mm を返す', () => {
    expect(formatRoomListTime(new Date(2026, 6, 30, 12, 2), NOW)).toBe('12:02');
    expect(formatRoomListTime(new Date(2026, 6, 30, 0, 0), NOW)).toBe('00:00');
    expect(formatRoomListTime(new Date(2026, 6, 30, 23, 59), NOW)).toBe('23:59');
  });

  it('前日は「昨日」を返す', () => {
    expect(formatRoomListTime(new Date(2026, 6, 29, 8, 5), NOW)).toBe('昨日');
  });

  it('月をまたぐ前日でも「昨日」を返す', () => {
    const firstOfMonth = new Date(2026, 7, 1, 9, 0);
    expect(formatRoomListTime(new Date(2026, 6, 31, 22, 0), firstOfMonth)).toBe('昨日');
  });

  it('同じ年の 2 日以上前は M/D を返す', () => {
    expect(formatRoomListTime(new Date(2026, 6, 28, 19, 45), NOW)).toBe('7/28');
    expect(formatRoomListTime(new Date(2026, 0, 3, 1, 0), NOW)).toBe('1/3');
  });

  it('前年以前は YYYY/M/D を返す', () => {
    expect(formatRoomListTime(new Date(2025, 11, 31, 23, 0), NOW)).toBe('2025/12/31');
  });

  it('未設定・不正な日付は空文字を返す', () => {
    expect(formatRoomListTime(undefined, NOW)).toBe('');
    expect(formatRoomListTime(null, NOW)).toBe('');
    expect(formatRoomListTime(new Date('invalid'), NOW)).toBe('');
  });
});

describe('formatRoomListPreview', () => {
  const lastMessage = { text: 'おはようございます', senderId: 'bob', senderName: 'Bob' };

  it('メッセージが無いときは案内文を返す', () => {
    expect(formatRoomListPreview(null, 'direct', 'alice')).toBe(NO_MESSAGE_LABEL);
    expect(formatRoomListPreview(undefined, 'group', 'alice')).toBe(NO_MESSAGE_LABEL);
  });

  it('1対1では送信者名を付けない', () => {
    expect(formatRoomListPreview(lastMessage, 'direct', 'alice')).toBe('おはようございます');
  });

  it('メモでは送信者名を付けない', () => {
    expect(formatRoomListPreview(lastMessage, 'memo', 'bob')).toBe('おはようございます');
  });

  it('グループでは送信者名を付ける', () => {
    expect(formatRoomListPreview(lastMessage, 'group', 'alice')).toBe('Bob: おはようございます');
  });

  it('グループの自分の発言は「自分」と表示する', () => {
    expect(formatRoomListPreview(lastMessage, 'group', 'bob')).toBe('自分: おはようございます');
  });

  it('グループで送信者名が空なら「不明」にする', () => {
    expect(formatRoomListPreview({ ...lastMessage, senderName: '' }, 'group', 'alice'))
      .toBe('不明: おはようございます');
  });

  it('currentUserId が無くてもグループは送信者名で表示する', () => {
    expect(formatRoomListPreview(lastMessage, 'group', null)).toBe('Bob: おはようございます');
    expect(formatRoomListPreview(lastMessage, 'group', undefined)).toBe('Bob: おはようございます');
  });

  it('本文が空文字でも接頭辞の規則は変わらない', () => {
    expect(formatRoomListPreview({ ...lastMessage, text: '' }, 'direct', 'alice')).toBe('');
    expect(formatRoomListPreview({ ...lastMessage, text: '' }, 'group', 'alice')).toBe('Bob: ');
  });
});
