// 工程管理の並び順（order）を扱うユーティリティ。
//
// なぜこの仕組みが必要か:
//   プロジェクト一覧やカンバンのカードは「並び替え」ができる。
//   もし order を 0,1,2,... の連番にすると、間に1件挿入するたびに後ろ全部を
//   振り直す必要があり、書き込みが大量になり同時編集で壊れやすい。
//   そこで「2つの要素の間に入る新しい文字列キー」を1回の計算で作れる
//   fractional indexing（分数インデックス）を使う。挿入は常に1書き込みで済む。
//
// キーの性質:
//   生成されるキーは [0-9A-Za-z]（BASE_62）だけで構成され、
//   文字列の辞書順（< 比較）がそのまま並び順になる。
//   この順序は Firestore の orderBy('order')（UTF-16コード順）とも一致する
//   （'0'..'9' < 'A'..'Z' < 'a'..'z' という ASCII 順のため）。

import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/**
 * ケース1: 初回（リストが空で1件目を作る）。両端が存在しない。
 * 例: generateKeyBetween(null, null) → "a0"
 */
export function firstOrderKey(): string {
  return generateKeyBetween(null, null);
}

/**
 * ケース2: 末尾に追加する。最後の要素のキーより後ろのキーを作る。
 * @param lastKey 現在の末尾要素の order。リストが空なら null を渡してよい（その場合は初回扱い）。
 */
export function appendOrderKey(lastKey: string | null): string {
  return generateKeyBetween(lastKey, null);
}

/**
 * ケース3: 先頭に挿入する。最初の要素のキーより前のキーを作る。
 * @param firstKey 現在の先頭要素の order。リストが空なら null を渡してよい。
 */
export function prependOrderKey(firstKey: string | null): string {
  return generateKeyBetween(null, firstKey);
}

/**
 * ケース4: 中間に挿入する。前後2つの要素の間に入るキーを作る。
 * @param prevKey 挿入位置の1つ前の要素の order（先頭に入れるなら null）
 * @param nextKey 挿入位置の1つ後の要素の order（末尾に入れるなら null）
 */
export function betweenOrderKey(prevKey: string | null, nextKey: string | null): string {
  return generateKeyBetween(prevKey, nextKey);
}

/**
 * ケース5: 全要素の order が壊れている/未設定（移行データや破損）の場合の一括再採番。
 * 渡した件数分の、昇順に並んだ新しいキー配列を返す。呼び出し側で既存ドキュメントへ
 * batch update して整える用途。
 * @param count 採番したい件数（0 以下なら空配列）
 */
export function rebuildOrderKeys(count: number): string[] {
  if (count <= 0) return [];
  return generateNKeysBetween(null, null, count);
}

/**
 * リストの末尾に追加するときの便利関数。
 * 既存の order 配列（並び済みでなくてもよい）から最大キーを求め、その後ろのキーを返す。
 * 空配列なら初回キーを返す。
 */
export function nextOrderKeyForList(existingOrders: readonly string[]): string {
  if (existingOrders.length === 0) return firstOrderKey();
  // 文字列の辞書順で最大のものが「末尾」。
  let max = existingOrders[0];
  for (const k of existingOrders) {
    if (k > max) max = k;
  }
  return appendOrderKey(max);
}
