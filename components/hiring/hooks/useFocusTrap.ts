'use client';

// Focus management for the board's modal surfaces (Modal, DetailDrawer). While
// active it (1) moves focus into the dialog, (2) keeps Tab / Shift+Tab cycling
// within it so keyboard and screen-reader users can't wander into the inert
// background, and (3) restores focus to whatever was focused before it opened
// (the trigger) when it deactivates. Paired with `aria-modal="true"` on the
// dialog and `inert` on the background, this is the standard accessible-dialog
// pattern — kept in one hook so Modal and the drawer can't drift.

import { useEffect, useRef } from 'react';

// Elements that can receive keyboard focus. `[tabindex="-1"]` is deliberately
// excluded (programmatically focusable, not Tab-reachable).
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function useFocusTrap<T extends HTMLElement>(
  active: boolean
): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    // Remember the trigger so focus returns to it on close.
    restoreRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // Move focus into the dialog (first focusable, else the container itself,
    // which the caller makes focusable with tabIndex={-1}).
    (focusables()[0] ?? container).focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        // Nothing tabbable — pin focus on the container.
        e.preventDefault();
        container!.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === first || !container!.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !container!.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      restoreRef.current?.focus?.();
    };
  }, [active]);

  return ref;
}
