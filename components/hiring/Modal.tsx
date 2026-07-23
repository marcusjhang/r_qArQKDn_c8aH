'use client';

// Lightweight modal built in the board's own design system (scoped under
// .ht-root), so it stays visually consistent with the drawer and cards.

import { useEffect } from 'react';
import { CloseButton } from '@/components/ui/close-button';
import { useFocusTrap } from './hooks/useFocusTrap';

export default function Modal({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // The modal is only mounted while open, so the trap is always active here; it
  // moves focus in, cycles Tab within the dialog, and restores focus to the
  // trigger on unmount.
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="scrim open" onClick={onClose} aria-hidden="true" />
      <div
        ref={trapRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </>
  );
}
