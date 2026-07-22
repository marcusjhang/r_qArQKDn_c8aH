'use client';

// Open/close state for a popover-style element that should dismiss on an
// outside click or Escape (used by the column stage-options menu). Attach
// `ref` to the wrapper that counts as "inside".

import { useEffect, useRef, useState } from 'react';

interface Dismissable {
  ref: React.RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export function useDismissable(): Dismissable {
  const ref = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Close on outside click / Escape while open.
  useEffect(() => {
    if (!isOpen) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  return {
    ref,
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((o) => !o)
  };
}
