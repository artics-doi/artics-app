// 吹き出し本文の選択と、メニューの「コピー」が使う文字列を決める純ロジック。
// 画面の選択範囲そのものを動かす処理は、DOM を持つ側だけが行う。

export const SELECTION_MOVE_THRESHOLD_PX = 5;
const MESSAGE_TEXT_ATTR = 'data-message-text';

export type PointerIntent = 'mouse' | 'touch';

export type SelectionClampPlan =
  | { type: 'keep' }
  | { type: 'ignore' }
  | { type: 'trim-to'; messageId: string };

/** マウスはクリックとドラッグを分ける。タッチとペンは長押しメニュー側に寄せる。 */
export function classifyPointerIntent(pointerType: string): PointerIntent {
  return pointerType === 'mouse' ? 'mouse' : 'touch';
}

/** マウスの長押しタイマーは張らない。ドラッグの途中でメニューが開くと選択範囲が壊れる。 */
export function shouldArmLongPress(intent: PointerIntent): boolean {
  return intent === 'touch';
}

/** スマホの長押しはブラウザ標準の文字選択を消してからメニューを出す。 */
export function shouldClearSelectionOnLongPress(intent: PointerIntent): boolean {
  return intent === 'touch';
}

export function passedMoveThreshold(
  dx: number,
  dy: number,
  threshold = SELECTION_MOVE_THRESHOLD_PX,
): boolean {
  return dx * dx + dy * dy >= threshold * threshold;
}

/**
 * 指を離したときにメニューを開くか。
 * すでに長押しで開いている場合は false（もう一度開くとメニューが閉じる）。
 * マウスが動いていた場合も false（文章の選択を優先する）。
 */
export function shouldOpenMenuOnRelease(input: {
  intent: PointerIntent;
  moved: boolean;
  longPressed: boolean;
}): boolean {
  if (input.longPressed) return false;
  if (input.moved) return false;
  return true;
}

/**
 * 選択の始点がメッセージ本文なら、終点が別の本文・名前・入力欄へ出ても、その本文の中へ戻す。
 * 始点が本文の外（入力欄など）なら、入力中の選択を奪わない。
 */
export function selectionClampPlan(
  anchorMessageId: string | null,
  focusMessageId: string | null,
): SelectionClampPlan {
  if (!anchorMessageId) return { type: 'ignore' };
  if (anchorMessageId === focusMessageId) return { type: 'keep' };
  return { type: 'trim-to', messageId: anchorMessageId };
}

export function messageTextIdFromNode(node: Node | null): string | null {
  if (!node) return null;
  // 要素ノードは 1。文字ノードは親要素から吹き出し本文を探す。
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  return element?.closest(`[${MESSAGE_TEXT_ATTR}]`)?.getAttribute(MESSAGE_TEXT_ATTR) ?? null;
}

/** そのメッセージ本文の中だけを選んでいるとき、選ばれた文字列を返す。 */
export function selectedTextWithinMessage(
  messageId: string,
  selection: Pick<Selection, 'isCollapsed' | 'rangeCount' | 'toString' | 'anchorNode' | 'focusNode'> | null,
): string | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  if (messageTextIdFromNode(selection.anchorNode) !== messageId) return null;
  if (messageTextIdFromNode(selection.focusNode) !== messageId) return null;
  const text = selection.toString();
  return text.length > 0 ? text : null;
}

/** 選択範囲があればそれだけ、なければメッセージ全文。 */
export function resolveCopyText(fullText: string, selectedText: string | null): string {
  if (selectedText && selectedText.length > 0) return selectedText;
  return fullText;
}

function edgeTextPosition(root: HTMLElement, edge: 'start' | 'end'): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let target: Text | null = null;
  let current = walker.nextNode();
  while (current) {
    target = current as Text;
    if (edge === 'start') break;
    current = walker.nextNode();
  }
  if (target) return { node: target, offset: edge === 'start' ? 0 : target.length };
  return { node: root, offset: edge === 'start' ? 0 : root.childNodes.length };
}

/** 選択の終点が本文の外にあるとき、始点はそのまま、終点をその本文の端へ移す。 */
export function trimSelectionToElement(selection: Selection, root: HTMLElement): void {
  const anchorNode = selection.anchorNode;
  if (!anchorNode || !root.contains(anchorNode)) return;
  const focusNode = selection.focusNode;
  if (focusNode && root.contains(focusNode)) return;

  const focusAfter = !focusNode
    || (anchorNode.compareDocumentPosition(focusNode) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  const edge = edgeTextPosition(root, focusAfter ? 'end' : 'start');
  selection.setBaseAndExtent(anchorNode, selection.anchorOffset, edge.node, edge.offset);
}
