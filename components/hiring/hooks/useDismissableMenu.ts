'use client';

// Open/close state for a trigger-button dropdown, plus the dismissal wiring
// every menu in the app repeated by hand: close on outside pointer-down and on
// Escape (both listeners attached only while open). It also owns the ARIA
// contract so the trigger/menu pairing stays consistent — the trigger gets
// aria-haspopup + aria-expanded + aria-controls, the menu gets a matching id +
// role="menu" — instead of each call site wiring (and drifting on) it.
//
// The caller attaches `wrapRef` to the element that contains both the trigger
// and the menu (outside-click is measured against it), spreads `triggerProps`
// onto the trigger button and `menuProps` onto the open menu, and reads `open`
// to decide whether to render the menu.

import { useEffect, useId, useRef, useState } from 'react';

export interface DismissableMenu {
  /** Whether the menu is currently open. */
  open: boolean;
  /** Set the open state directly (e.g. close after selecting an item). */
  setOpen: (open: boolean) => void;
  /** Toggle open/closed (wire to the trigger's onClick if you don't use triggerProps.onClick). */
  toggle: () => void;
  /** Close the menu. */
  close: () => void;
  /** Attach to the wrapper that contains both trigger and menu (outside-click boundary). */
  wrapRef: React.RefObject<HTMLDivElement | null>;
  /** Spread onto the trigger button — ARIA state + toggle handler. */
  triggerProps: {
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string;
    onClick: () => void;
  };
  /** Spread onto the open menu element — role + id the trigger points at. */
  menuProps: {
    id: string;
    role: 'menu';
  };
}

export function useDismissableMenu(
  opts: {
    /** Called after the menu closes via outside-click or Escape (e.g. reset transient state). */
    onDismiss?: () => void;
  } = {}
): DismissableMenu {
  const { onDismiss } = opts;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Keep the latest onDismiss without re-subscribing the listeners on each render.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Close the dropdown on outside click / Escape (listeners live only while open).
  useEffect(() => {
    if (!open) return;
    function dismiss() {
      setOpen(false);
      onDismissRef.current?.();
    }
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        dismiss();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return {
    open,
    setOpen,
    toggle: () => setOpen((o) => !o),
    close: () => setOpen(false),
    wrapRef,
    triggerProps: {
      'aria-haspopup': 'menu',
      'aria-expanded': open,
      'aria-controls': menuId,
      onClick: () => setOpen((o) => !o)
    },
    menuProps: {
      id: menuId,
      role: 'menu'
    }
  };
}
