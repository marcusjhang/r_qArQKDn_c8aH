'use client';

// A small inline "ⓘ" that reveals a help tooltip on hover or keyboard focus.

import { Info } from 'lucide-react';
import { useId, type ReactNode } from 'react';

export default function InfoHint({
  label,
  title,
  trigger = <Info size={13} aria-hidden />,
  children
}: {
  /** Accessible name for the trigger (what the hint explains). */
  label: string;
  /** Optional bold heading shown at the top of the tooltip. */
  title?: string;
  /** What the hover target shows (defaults to the ⓘ icon). */
  trigger?: ReactNode;
  /** Tooltip body. */
  children: ReactNode;
}) {
  const id = useId();
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="inline-flex cursor-help items-center p-0 leading-none text-muted-foreground hover:text-primary focus-visible:text-primary"
        aria-label={label}
        aria-describedby={id}
      >
        {trigger}
      </button>
      {/* Transparent `before` bridge over the trigger-to-popup gap so the pointer can travel in without closing it. */}
      <span
        className="invisible absolute left-0 top-full z-[25] mt-1.5 w-[260px] max-w-[80vw] rounded-md border border-border bg-surface px-3 py-2.5 text-[12.5px] font-normal normal-case tracking-normal text-foreground opacity-0 shadow-ds pointer-events-none before:absolute before:-top-2 before:left-0 before:right-0 before:h-2 before:content-[''] group-hover:visible group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
        id={id}
        role="tooltip"
      >
        {title && (
          <span className="mb-[5px] block text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground">
            {title}
          </span>
        )}
        {children}
      </span>
    </span>
  );
}
