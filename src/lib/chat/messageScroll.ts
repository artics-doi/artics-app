import type { ExtendedMessage } from '../../types';

type ScrollMessage = Pick<ExtendedMessage, 'id' | 'createdAt' | 'senderId' | '_pending'>;

// 総件数ではなく、直前の最新メッセージより後に追加されたIDを判定する。
// 最新50件の購読では、新着受信時にも総件数が変わらないことがある。
export function getArrivingMessages<T extends ScrollMessage>(previous: T[], next: T[]): T[] {
  if (previous.length === 0) return [];
  const knownIds = new Set(previous.map((message) => message.id));
  const previousServer = previous.filter((message) => !message._pending);
  const lastServer = previousServer[previousServer.length - 1];
  const serverTailIndex = lastServer ? next.findIndex((message) => message.id === lastServer.id) : -1;

  return next.filter((message, index) => {
    if (knownIds.has(message.id) || message._pending === 'failed') return false;
    if (message._pending === 'sending') return true;
    if (!lastServer) return false;
    if (serverTailIndex >= 0) return index > serverTailIndex;
    // 最新メッセージが削除された場合は、過去分を新着扱いしない。
    return Boolean(message.createdAt && lastServer.createdAt
      && message.createdAt.getTime() >= lastServer.createdAt.getTime());
  });
}

export interface MessageScrollAnchor {
  element: HTMLElement;
  offset: number;
}

export function captureMessageAnchor(list: HTMLElement): MessageScrollAnchor | null {
  const top = list.getBoundingClientRect().top;
  const element = Array.from(list.querySelectorAll<HTMLElement>('[id^="message-"]'))
    .find((message) => message.getBoundingClientRect().bottom > top);
  return element ? { element, offset: element.getBoundingClientRect().top - top } : null;
}

export function restoreMessageAnchor(list: HTMLElement, anchor: MessageScrollAnchor): void {
  if (!list.contains(anchor.element)) return;
  const offset = anchor.element.getBoundingClientRect().top - list.getBoundingClientRect().top;
  // ブラウザー自身が位置補正済みの場合は差が0になり、二重に移動しない。
  list.scrollTop += offset - anchor.offset;
}
