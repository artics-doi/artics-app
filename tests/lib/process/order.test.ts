// 工程管理の order（並び順キー）ロジックの単体テスト。
//
// 重要: vitest のグローバル（describe/test/expect）は named import する。
//   理由: tsconfig.node.json の types は ["node"] のみで vitest を含まず、
//   eslint も tests を globals.browser で見るため、グローバル参照だと型/no-undef で落ちる。
//   既存 tests/rules も named import 方式なのでそれに合わせる（最小影響）。
import { describe, test, expect } from 'vitest';
import {
  appendOrderKey,
  betweenOrderKey,
  firstOrderKey,
  nextOrderKeyForList,
  prependOrderKey,
  rebuildOrderKeys,
} from '../../../src/lib/process/order';

describe('order キー採番（5ケース）', () => {
  test('ケース1: 初回（両端null）はキーを1つ返す', () => {
    const k = firstOrderKey();
    expect(typeof k).toBe('string');
    expect(k.length).toBeGreaterThan(0);
  });

  test('ケース2: 末尾追加は最後のキーより後ろになる', () => {
    const first = firstOrderKey();
    const next = appendOrderKey(first);
    expect(first < next).toBe(true);
  });

  test('ケース2: 末尾追加で lastKey に null を渡すと初回と同じ扱い（先頭キー）', () => {
    const k = appendOrderKey(null);
    expect(typeof k).toBe('string');
    expect(k.length).toBeGreaterThan(0);
  });

  test('ケース3: 先頭挿入は最初のキーより前になる', () => {
    const first = firstOrderKey();
    const before = prependOrderKey(first);
    expect(before < first).toBe(true);
  });

  test('ケース4: 中間挿入は前後キーの間に入る', () => {
    const a = firstOrderKey();
    const b = appendOrderKey(a);
    const mid = betweenOrderKey(a, b);
    expect(a < mid).toBe(true);
    expect(mid < b).toBe(true);
  });

  test('ケース4: 何度も中間挿入しても順序が保たれる', () => {
    const a = firstOrderKey();
    let b = appendOrderKey(a);
    // a と b の間に繰り返し挿入する
    const inserted: string[] = [];
    for (let i = 0; i < 10; i++) {
      const mid = betweenOrderKey(a, b);
      expect(a < mid).toBe(true);
      expect(mid < b).toBe(true);
      inserted.push(mid);
      b = mid; // 次はさらに前寄りへ挿入
    }
    // 最後に挿入したものほど a に近い（小さい）はず
    for (let i = 1; i < inserted.length; i++) {
      expect(inserted[i] < inserted[i - 1]).toBe(true);
    }
  });

  test('ケース5: 全要素null/破損時の一括再採番は count 件を昇順で返す', () => {
    const keys = rebuildOrderKeys(5);
    expect(keys).toHaveLength(5);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1] < keys[i]).toBe(true);
    }
  });

  test('ケース5: count が0以下なら空配列', () => {
    expect(rebuildOrderKeys(0)).toEqual([]);
    expect(rebuildOrderKeys(-3)).toEqual([]);
  });
});

describe('nextOrderKeyForList（末尾追加ヘルパー）', () => {
  test('空配列なら初回キーを返す', () => {
    const k = nextOrderKeyForList([]);
    expect(typeof k).toBe('string');
    expect(k.length).toBeGreaterThan(0);
  });

  test('順不同の既存配列でも最大キーの後ろを返す', () => {
    const a = firstOrderKey();
    const b = appendOrderKey(a);
    const c = appendOrderKey(b);
    // あえて順不同で渡す
    const next = nextOrderKeyForList([b, a, c]);
    expect(c < next).toBe(true);
  });
});

describe('文字列 orderBy 整合（Firestore UTF-16 順との一致）', () => {
  test('生成キーは [0-9A-Za-z] のみで構成される', () => {
    const keys = rebuildOrderKeys(20);
    for (const k of keys) {
      expect(k).toMatch(/^[0-9A-Za-z]+$/);
    }
  });

  test('JS の文字列ソート結果が採番順（昇順）と一致する', () => {
    // 連続採番したキーは、JS のデフォルト文字列ソートでも同じ順序になる。
    // JS の Array.sort（デフォルト）は UTF-16 コード単位の辞書順で、
    // Firestore の orderBy 文字列比較と同じ規則。よってこれが一致すれば
    // Firestore 上でも採番順どおりに並ぶことが担保できる。
    const ordered: string[] = [];
    let prev: string | null = null;
    for (let i = 0; i < 30; i++) {
      const k = appendOrderKey(prev);
      ordered.push(k);
      prev = k;
    }
    const sorted = [...ordered].sort();
    expect(sorted).toEqual(ordered);
  });

  test('中間挿入を混ぜても文字列ソートで正しい順序に並ぶ', () => {
    // 末尾追加と中間挿入を混在させ、最終的な論理順と文字列ソート順が一致するか確認。
    const a = firstOrderKey();
    const e = appendOrderKey(a); // a < e
    const c = betweenOrderKey(a, e); // a < c < e
    const b = betweenOrderKey(a, c); // a < b < c
    const d = betweenOrderKey(c, e); // c < d < e
    const logicalOrder = [a, b, c, d, e]; // 期待する論理順
    const sorted = [...logicalOrder].sort();
    expect(sorted).toEqual(logicalOrder);
  });
});
