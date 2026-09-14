import { describe, expect, test } from 'vitest';
import { captureMessageAnchor, getArrivingMessages, restoreMessageAnchor } from '../../../src/lib/chat/messageScroll';

const message = (id: number, senderId = 'other') => ({
  id: String(id), senderId, createdAt: new Date(id * 1000),
});
const page = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => message(start + i));

describe('新着と過去履歴の区別', () => {
  test.each(['self', 'other'])('最新投稿が%sでも過去50件の追加は新着にならない', (sender) => {
    const previous = [...page(51, 99), message(100, sender)];
    expect(getArrivingMessages(previous, [...page(1, 50), ...previous])).toEqual([]);
  });

  test('最新50件の入れ替わりで総件数が同じでも新着を検出する', () => {
    expect(getArrivingMessages(page(1, 50), page(2, 51))).toEqual([message(51)]);
  });

  test('過去50件と新着2件の同時追加では新着2件だけを返す', () => {
    expect(getArrivingMessages(page(51, 100), page(1, 102))).toEqual(page(101, 102));
  });

  test('初回取得・ルーム切替後の初回取得は新着に含めない', () => {
    expect(getArrivingMessages([], page(1, 50))).toEqual([]);
  });

  test('同一IDの編集や既読更新は新着にならない', () => {
    expect(getArrivingMessages(page(1, 50), page(1, 50).map((m) => ({ ...m, text: '編集', readBy: ['self'] })))).toEqual([]);
  });

  test('末尾の削除だけでは新着にならず、同時に追加された新着は検出する', () => {
    expect(getArrivingMessages(page(1, 50), page(1, 49))).toEqual([]);
    expect(getArrivingMessages(page(1, 50), [...page(1, 49), message(51)] )).toEqual([message(51)]);
  });

  test('同時刻でも末尾に新しいIDが追加されれば新着にする', () => {
    const next = { ...message(51), createdAt: message(50).createdAt };
    expect(getArrivingMessages(page(1, 50), [...page(1, 50), next])).toEqual([next]);
  });

  test('自分の新しい送信中メッセージを検出する', () => {
    const pending = { ...message(51, 'self'), id: 'local-51', _pending: 'sending' as const };
    expect(getArrivingMessages(page(1, 50), [...page(1, 50), pending])).toEqual([pending]);
  });

  test('送信中・失敗メッセージが末尾に残っても履歴は新着にならない', () => {
    const pending = { ...message(101, 'self'), id: 'local-101', _pending: 'failed' as const };
    const previous = [...page(51, 100), pending];
    expect(getArrivingMessages(previous, [...page(1, 50), ...previous])).toEqual([]);
    expect(getArrivingMessages(previous, [...page(51, 102), pending])).toEqual(page(101, 102));
  });
});

describe('過去履歴追加時の閲覧位置の補正', () => {
  // 実ブラウザーの代わりに測定値を指定し、補正量と二重補正防止を検証する。
  function layout() {
    let messageTop = 90;
    const above = { getBoundingClientRect: () => ({ top: 30, bottom: 80 }) };
    const visible = { getBoundingClientRect: () => ({ top: messageTop, bottom: messageTop + 60 }) };
    const list = {
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 100 }),
      querySelectorAll: () => [above, visible],
      contains: (element: unknown) => element === visible,
    } as unknown as HTMLElement;
    return { list, visible, moveTo: (top: number) => { messageTop = top; } };
  }

  test('部分的に見えているメッセージの位置を維持する', () => {
    const { list, visible, moveTo } = layout();
    const anchor = captureMessageAnchor(list)!;
    expect(anchor.element).toBe(visible);
    expect(anchor.offset).toBe(-10);
    moveTo(1090);
    restoreMessageAnchor(list, anchor);
    expect(list.scrollTop).toBe(1000);
  });

  test('ブラウザーがすでに補正した場合はさらに移動しない', () => {
    const { list } = layout();
    const anchor = captureMessageAnchor(list)!;
    list.scrollTop = 1000;
    restoreMessageAnchor(list, anchor);
    expect(list.scrollTop).toBe(1000);
  });

  test('ルーム切替などで基準要素がなくなった場合は移動しない', () => {
    const { list } = layout();
    restoreMessageAnchor(list, { element: {} as HTMLElement, offset: -10 });
    expect(list.scrollTop).toBe(0);
  });
});
