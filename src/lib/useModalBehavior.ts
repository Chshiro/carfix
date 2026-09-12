import { useEffect, useRef, useCallback } from 'react';

export interface SafeBackdropClickParams {
  startedTarget: unknown;
  endedTarget: unknown;
  currentTarget: unknown;
  isDirty: boolean;
}

export function evaluateBackdropDismiss({
  startedTarget,
  endedTarget,
  currentTarget,
  isDirty,
}: SafeBackdropClickParams): { shouldClose: boolean; blockedByDirty: boolean } {
  const startedOnBackdrop = startedTarget === currentTarget;
  const endedOnBackdrop = endedTarget === currentTarget;
  if (!startedOnBackdrop || !endedOnBackdrop) {
    return { shouldClose: false, blockedByDirty: false };
  }
  if (isDirty) {
    return { shouldClose: false, blockedByDirty: true };
  }
  return { shouldClose: true, blockedByDirty: false };
}

export function evaluateEscapeKeyDismiss(
  key: string,
  isDirty: boolean
): { shouldClose: boolean; blockedByDirty: boolean } {
  if (key !== 'Escape') {
    return { shouldClose: false, blockedByDirty: false };
  }
  if (isDirty) {
    return { shouldClose: false, blockedByDirty: true };
  }
  return { shouldClose: true, blockedByDirty: false };
}

export function calculateScrollbarCompensation(
  windowWidth: number,
  documentClientWidth: number
): number {
  const width = windowWidth - documentClientWidth;
  return width > 0 ? width : 0;
}

export function calculateNextTrapFocusIndex(
  currentIndex: number,
  totalElements: number,
  isShift: boolean
): number {
  if (totalElements <= 0) return -1;
  if (isShift) {
    return currentIndex <= 0 ? totalElements - 1 : currentIndex - 1;
  }
  return currentIndex >= totalElements - 1 ? 0 : currentIndex + 1;
}

export interface UseModalBehaviorOptions {
  isOpen: boolean;
  onClose: () => void;
  isDirty?: boolean;
  closeOnEsc?: boolean;
  lockScroll?: boolean;
  autoFocus?: boolean;
  restoreFocus?: boolean;
  onAttemptCloseDirty?: () => void;
}

export interface UseModalBehaviorReturn {
  contentRef: React.RefObject<HTMLDivElement>;
  backdropProps: {
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => void;
    onMouseUp: (e: React.MouseEvent<HTMLElement>) => void;
  };
  handleKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
}

/**
 * Enterprise-grade modal behavior hook.
 * - Safe Backdrop Click: Prevents accidental dismissal when dragging/selecting text inside
 *   dialog and releasing the mouse button outside on the backdrop.
 * - Dirty Form Guard: Blocks backdrop dismissal if form has unsaved edits.
 * - Keyboard: Escape key to close.
 * - Scroll Lock: Prevents background document scroll and compensates scrollbar width.
 * - Focus Management: Moves focus into modal on open and restores previous focus on close.
 */
export function useModalBehavior({
  isOpen,
  onClose,
  isDirty = false,
  closeOnEsc = true,
  lockScroll = true,
  autoFocus = true,
  restoreFocus = true,
  onAttemptCloseDirty,
}: UseModalBehaviorOptions): UseModalBehaviorReturn {
  const contentRef = useRef<HTMLDivElement>(null);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // 1. Scroll Lock with scrollbar shift compensation
  useEffect(() => {
    if (!isOpen || !lockScroll) return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;

    // Calculate scrollbar width
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [isOpen, lockScroll]);

  // 2. Global Escape key handling
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isDirty && onAttemptCloseDirty) {
          onAttemptCloseDirty();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isOpen, closeOnEsc, isDirty, onClose, onAttemptCloseDirty]);

  // 3. Focus management (Autofocus & Restore Focus)
  useEffect(() => {
    if (!isOpen) return;

    if (typeof document !== 'undefined') {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    }

    if (autoFocus && contentRef.current) {
      const focusableSelector =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const focusableElements = contentRef.current.querySelectorAll<HTMLElement>(focusableSelector);

      // Prefer element with autofocus attribute, else first focusable element
      const autoFocusEl = Array.from(focusableElements).find((el) => el.hasAttribute('autofocus'));
      const targetEl = autoFocusEl || focusableElements[0];

      if (targetEl) {
        requestAnimationFrame(() => {
          targetEl.focus();
        });
      }
    }

    return () => {
      if (restoreFocus && previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, autoFocus, restoreFocus]);

  // 4. Safe Backdrop Click handlers
  const handleBackdropMouseDown = useCallback((e: React.MouseEvent<HTMLElement>) => {
    mouseDownTargetRef.current = e.target;
  }, []);

  const handleBackdropMouseUp = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const startedOnBackdrop = mouseDownTargetRef.current === e.currentTarget;
      const endedOnBackdrop = e.target === e.currentTarget;

      // Only close if the entire click cycle started and ended directly on the backdrop element
      if (startedOnBackdrop && endedOnBackdrop) {
        if (isDirty) {
          if (onAttemptCloseDirty) {
            onAttemptCloseDirty();
          }
        } else {
          onClose();
        }
      }

      mouseDownTargetRef.current = null;
    },
    [isDirty, onClose, onAttemptCloseDirty]
  );

  // 5. Container KeyDown (Focus Trap Tab navigation)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Tab' || !contentRef.current) return;

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = contentRef.current.querySelectorAll<HTMLElement>(focusableSelector);
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }, []);

  return {
    contentRef,
    backdropProps: {
      onMouseDown: handleBackdropMouseDown,
      onMouseUp: handleBackdropMouseUp,
    },
    handleKeyDown,
  };
}
