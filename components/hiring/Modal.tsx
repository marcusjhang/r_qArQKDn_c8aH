'use client';

// Lightweight modal built with the app's Tailwind design tokens.

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
  // Only mounted while open, so the focus trap is always active.
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
      <div
        className="fixed inset-0 z-20 bg-[rgba(16,24,40,0.32)]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={trapRef}
        className="fixed left-1/2 top-1/2 z-30 flex w-[min(440px,calc(100%-32px))] max-h-[calc(100%-48px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-ds"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="flex items-center gap-3 border-b border-border p-4">
          <h2 className="m-0 min-w-0 flex-1 text-[16px]">{title}</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </>
  );
}
