import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';

interface UseModalParams {
  isOpen: boolean;
  onClose: () => void;
  /**
   * M-38: モーダルを開いた直後にフォーカスを当てる要素を指定する。
   * 省略時は最初のフォーカス可能要素にフォーカスを当てる（既存挙動）。
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * M-38: モーダルを閉じた後に、開く前のフォーカス先へ戻すか（デフォルト true）。
   */
  restoreFocus?: boolean;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.getAttribute('aria-hidden') === 'true') return false;
    return element.offsetParent !== null || element === document.activeElement;
  });
}

export function useModal({ isOpen, onClose, initialFocusRef, restoreFocus = true }: UseModalParams) {
  const modalRef = useRef<HTMLDivElement>(null);
  // M-38: 開く前のフォーカス要素を保存（閉じる時に復元）
  const previousActiveRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    previousActiveRef.current = document.activeElement as HTMLElement | null;

    return () => {
      document.body.style.overflow = previousOverflow;
      // M-38: フォーカス復元（document に残っているかチェック）
      if (restoreFocus && previousActiveRef.current && document.contains(previousActiveRef.current)) {
        previousActiveRef.current.focus();
      }
    };
  }, [isOpen, restoreFocus]);

  useEffect(() => {
    if (!isOpen) return;

    const modalElement = modalRef.current;
    if (!modalElement) return;

    const focusInitial = () => {
      // M-38: initialFocusRef があれば優先
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }
      const focusableElements = getFocusableElements(modalElement);
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      } else {
        modalElement.focus();
      }
    };

    focusInitial();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements(modalElement);
      if (focusableElements.length === 0) {
        event.preventDefault();
        modalElement.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!activeElement || activeElement === firstElement || !modalElement.contains(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (!activeElement || activeElement === lastElement || !modalElement.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, initialFocusRef]);

  const modalProps = useMemo(() => ({
    ref: modalRef,
    role: 'dialog' as const,
    'aria-modal': true as const,
    tabIndex: -1 as const
  }), []);

  return { modalProps };
}

export default useModal;
