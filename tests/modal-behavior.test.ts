import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import {
  useModalBehavior,
  evaluateBackdropDismiss,
  evaluateEscapeKeyDismiss,
  calculateScrollbarCompensation,
  calculateNextTrapFocusIndex,
} from '../src/lib/useModalBehavior';

// Minimal dispatcher harness to execute React hooks in Node environment
function setupHookTestEnv() {
  const state: any[] = [];
  let index = 0;
  const effects: Array<() => void | (() => void)> = [];
  const cleanups: Array<() => void> = [];

  const dispatcher = {
    useRef: (initialValue: any) => {
      if (index >= state.length) {
        state.push({ current: initialValue });
      }
      return state[index++];
    },
    useCallback: (fn: any) => fn,
    useEffect: (effectFn: any) => {
      effects.push(effectFn);
    },
  };

  // @ts-expect-error React internals for headless hook testing
  const secret = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const originalDispatcher = secret.ReactCurrentDispatcher.current;
  secret.ReactCurrentDispatcher.current = dispatcher;

  const runEffects = () => {
    for (const eff of effects) {
      const cleanup = eff();
      if (typeof cleanup === 'function') {
        cleanups.push(cleanup);
      }
    }
  };

  const cleanupAll = () => {
    for (const c of cleanups) {
      c();
    }
    secret.ReactCurrentDispatcher.current = originalDispatcher;
  };

  return { runEffects, cleanupAll };
}

describe('Modal Dialog Architecture & Behavior', () => {
  describe('Pure Evaluation Logic (evaluateBackdropDismiss)', () => {
    const backdropEl = { id: 'backdrop' };
    const innerEl = { id: 'inner-content' };

    it('prevents dismissal when drag-selection starts inside and ends on backdrop', () => {
      const result = evaluateBackdropDismiss({
        startedTarget: innerEl,
        endedTarget: backdropEl,
        currentTarget: backdropEl,
        isDirty: false,
      });
      expect(result.shouldClose).toBe(false);
      expect(result.blockedByDirty).toBe(false);
    });

    it('prevents dismissal when drag starts on backdrop and ends inside content', () => {
      const result = evaluateBackdropDismiss({
        startedTarget: backdropEl,
        endedTarget: innerEl,
        currentTarget: backdropEl,
        isDirty: false,
      });
      expect(result.shouldClose).toBe(false);
      expect(result.blockedByDirty).toBe(false);
    });

    it('allows dismissal on clean click strictly on backdrop when isDirty is false', () => {
      const result = evaluateBackdropDismiss({
        startedTarget: backdropEl,
        endedTarget: backdropEl,
        currentTarget: backdropEl,
        isDirty: false,
      });
      expect(result.shouldClose).toBe(true);
      expect(result.blockedByDirty).toBe(false);
    });

    it('blocks backdrop dismissal when form is dirty (isDirty === true)', () => {
      const result = evaluateBackdropDismiss({
        startedTarget: backdropEl,
        endedTarget: backdropEl,
        currentTarget: backdropEl,
        isDirty: true,
      });
      expect(result.shouldClose).toBe(false);
      expect(result.blockedByDirty).toBe(true);
    });
  });

  describe('Keyboard Escape Handling (evaluateEscapeKeyDismiss)', () => {
    it('allows closing on Escape when form is clean', () => {
      const result = evaluateEscapeKeyDismiss('Escape', false);
      expect(result.shouldClose).toBe(true);
      expect(result.blockedByDirty).toBe(false);
    });

    it('blocks closing on Escape when form has unsaved edits', () => {
      const result = evaluateEscapeKeyDismiss('Escape', true);
      expect(result.shouldClose).toBe(false);
      expect(result.blockedByDirty).toBe(true);
    });

    it('ignores other keys like Enter or Space', () => {
      expect(evaluateEscapeKeyDismiss('Enter', false).shouldClose).toBe(false);
      expect(evaluateEscapeKeyDismiss('Tab', false).shouldClose).toBe(false);
    });
  });

  describe('Scrollbar Compensation & Focus Calculation', () => {
    it('calculates exact scrollbar width to prevent layout jitter', () => {
      expect(calculateScrollbarCompensation(1200, 1185)).toBe(15);
      expect(calculateScrollbarCompensation(1200, 1200)).toBe(0);
      expect(calculateScrollbarCompensation(1000, 1020)).toBe(0);
    });

    it('cycles focus trap correctly with Tab and Shift+Tab', () => {
      // Tab forward: 0 -> 1 -> 2 -> 0
      expect(calculateNextTrapFocusIndex(0, 3, false)).toBe(1);
      expect(calculateNextTrapFocusIndex(2, 3, false)).toBe(0);

      // Shift+Tab backward: 2 -> 1 -> 0 -> 2
      expect(calculateNextTrapFocusIndex(2, 3, true)).toBe(1);
      expect(calculateNextTrapFocusIndex(0, 3, true)).toBe(2);
    });
  });

  describe('Integrated useModalBehavior Hook Execution', () => {
    let originalWindow: typeof window;
    let originalDocument: typeof document;
    let registeredWindowEvents: Map<string, Function[]>;
    let bodyStyles: Record<string, string>;

    beforeEach(() => {
      registeredWindowEvents = new Map();
      bodyStyles = { overflow: '', paddingRight: '' };

      originalWindow = globalThis.window;
      originalDocument = globalThis.document;

      globalThis.window = {
        innerWidth: 1200,
        addEventListener: (evt: string, handler: unknown) => {
          const list = registeredWindowEvents.get(evt) || [];
          list.push(handler as Function);
          registeredWindowEvents.set(evt, list);
        },
        removeEventListener: (evt: string, handler: unknown) => {
          const list = registeredWindowEvents.get(evt) || [];
          registeredWindowEvents.set(evt, list.filter((h) => h !== handler));
        },
      } as unknown as Window & typeof globalThis;

      globalThis.document = {
        documentElement: { clientWidth: 1184 } as unknown as HTMLElement,
        body: { style: bodyStyles as unknown as CSSStyleDeclaration } as unknown as HTMLElement,
        activeElement: null,
      } as unknown as Document;
    });

    afterEach(() => {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
    });

    it('executes full backdrop click cycle and honors isDirty guard', () => {
      const h1 = setupHookTestEnv();
      const onClose = vi.fn();
      const onAttemptCloseDirty = vi.fn();

      const { backdropProps } = useModalBehavior({
        isOpen: true,
        onClose,
        isDirty: true,
        onAttemptCloseDirty,
      });
      h1.runEffects();

      const backdrop = { id: 'backdrop' } as unknown as HTMLElement;

      // Click on backdrop with isDirty === true
      backdropProps.onMouseDown({ target: backdrop, currentTarget: backdrop } as any);
      backdropProps.onMouseUp({ target: backdrop, currentTarget: backdrop } as any);

      expect(onClose).not.toHaveBeenCalled();
      expect(onAttemptCloseDirty).toHaveBeenCalledTimes(1);

      h1.cleanupAll();
    });

    it('dismisses modal on clean backdrop click when not dirty', () => {
      const h2 = setupHookTestEnv();
      const onClose = vi.fn();

      const { backdropProps } = useModalBehavior({
        isOpen: true,
        onClose,
        isDirty: false,
      });
      h2.runEffects();

      const backdrop = { id: 'backdrop' } as unknown as HTMLElement;

      backdropProps.onMouseDown({ target: backdrop, currentTarget: backdrop } as any);
      backdropProps.onMouseUp({ target: backdrop, currentTarget: backdrop } as any);

      expect(onClose).toHaveBeenCalledTimes(1);
      h2.cleanupAll();
    });

    it('listens for global Escape keydown and locks body scroll', () => {
      const h3 = setupHookTestEnv();
      const onClose = vi.fn();

      useModalBehavior({
        isOpen: true,
        onClose,
        isDirty: false,
        lockScroll: true,
      });
      h3.runEffects();

      // Verify scroll lock & padding
      expect(bodyStyles.overflow).toBe('hidden');
      expect(bodyStyles.paddingRight).toBe('16px'); // 1200 - 1184

      // Trigger Escape key
      const keydownListeners = registeredWindowEvents.get('keydown') || [];
      expect(keydownListeners.length).toBeGreaterThan(0);

      keydownListeners.forEach((listener) => {
        listener({ key: 'Escape', preventDefault: vi.fn() });
      });

      expect(onClose).toHaveBeenCalledTimes(1);

      // Cleanup
      h3.cleanupAll();
      expect(bodyStyles.overflow).toBe('');
      expect(bodyStyles.paddingRight).toBe('');
    });
  });
});
