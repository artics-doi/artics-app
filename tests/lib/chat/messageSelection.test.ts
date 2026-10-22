import { describe, expect, test } from 'vitest';
import {
  classifyPointerIntent,
  messageTextIdFromNode,
  passedMoveThreshold,
  resolveCopyText,
  selectedTextWithinMessage,
  selectionClampPlan,
  shouldArmLongPress,
  shouldClearSelectionOnLongPress,
  shouldOpenMenuOnRelease,
} from '../../../src/lib/chat/messageSelection';

function messageNode(id: string | null): Node {
  return {
    nodeType: 1,
    parentElement: null,
    closest: () => (id ? { getAttribute: () => id } : null),
  } as unknown as Node;
}

describe('ポインタを離したときのメニュー', () => {
  test('マウスが動いたらメニューを開かない', () => {
    expect(shouldOpenMenuOnRelease({ intent: 'mouse', moved: true, longPressed: false })).toBe(false);
  });

  test('マウスを動かさず離したらメニューを開く', () => {
    expect(shouldOpenMenuOnRelease({ intent: 'mouse', moved: false, longPressed: false })).toBe(true);
  });

  test('マウスでは長押しタイマーを張らない', () => {
    expect(classifyPointerIntent('mouse')).toBe('mouse');
    expect(shouldArmLongPress('mouse')).toBe(false);
    expect(shouldClearSelectionOnLongPress('mouse')).toBe(false);
  });

  test('タッチの長押しはメニューを出し、離したときには重ねて開かない', () => {
    expect(shouldArmLongPress('touch')).toBe(true);
    expect(shouldClearSelectionOnLongPress('touch')).toBe(true);
    expect(shouldOpenMenuOnRelease({ intent: 'touch', moved: false, longPressed: true })).toBe(false);
  });

  test('タッチを動かさずすぐ離したらメニューを開く', () => {
    expect(shouldOpenMenuOnRelease({ intent: 'touch', moved: false, longPressed: false })).toBe(true);
  });

  test('タッチが動いたらスクロールなのでメニューを開かない', () => {
    expect(shouldOpenMenuOnRelease({ intent: 'touch', moved: true, longPressed: false })).toBe(false);
  });

  test('ペンはタッチと同じく長押し側', () => {
    expect(classifyPointerIntent('pen')).toBe('touch');
  });

  test('数ピクセル以内の揺れはクリックのまま', () => {
    expect(passedMoveThreshold(2, 2)).toBe(false);
    expect(passedMoveThreshold(5, 0)).toBe(true);
  });
});

describe('選択範囲を本文の中に戻す', () => {
  test('同じ本文の中ならそのまま', () => {
    expect(selectionClampPlan('m1', 'm1')).toEqual({ type: 'keep' });
  });

  test('本文から入力欄や別メッセージへ出たら、始めた本文へ戻す', () => {
    expect(selectionClampPlan('m1', null)).toEqual({ type: 'trim-to', messageId: 'm1' });
    expect(selectionClampPlan('m1', 'm2')).toEqual({ type: 'trim-to', messageId: 'm1' });
  });

  test('入力欄から始まった選択は奪わない', () => {
    expect(selectionClampPlan(null, 'm1')).toEqual({ type: 'ignore' });
    expect(selectionClampPlan(null, null)).toEqual({ type: 'ignore' });
  });
});

describe('本文の中の選択', () => {
  test('文字ノードでも親の本文IDを返す', () => {
    const text = { nodeType: 3, parentElement: messageNode('m1') } as unknown as Node;
    expect(messageTextIdFromNode(text)).toBe('m1');
    expect(messageTextIdFromNode(null)).toBeNull();
  });

  test('同じ本文の中を選んでいればその文字列', () => {
    expect(selectedTextWithinMessage('m1', {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => '休み',
      anchorNode: messageNode('m1'),
      focusNode: messageNode('m1'),
    })).toBe('休み');
  });

  test('別の本文や入力欄にまたがる選択はコピーに使わない', () => {
    expect(selectedTextWithinMessage('m1', {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => '休みます',
      anchorNode: messageNode('m1'),
      focusNode: messageNode('m2'),
    })).toBeNull();
    expect(selectedTextWithinMessage('m1', {
      isCollapsed: true,
      rangeCount: 1,
      toString: () => '',
      anchorNode: messageNode('m1'),
      focusNode: messageNode('m1'),
    })).toBeNull();
  });
});

describe('コピーする文字列', () => {
  test('本文の中を選んでいればその範囲だけ', () => {
    expect(resolveCopyText('明日は休みます。', '休み')).toBe('休み');
  });

  test('選択がなければメッセージ全文', () => {
    expect(resolveCopyText('明日は休みます。', null)).toBe('明日は休みます。');
    expect(resolveCopyText('明日は休みます。', '')).toBe('明日は休みます。');
  });
});
