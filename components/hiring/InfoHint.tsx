'use client';

// A small inline "ⓘ" that reveals a help tooltip on hover or keyboard focus —
// the same reveal-on-hover pattern the candidate search uses, packaged so any
// label can carry a short explanation without a separate click target. The
// tooltip id is generated per instance so multiple hints on one screen stay
// distinct for `aria-describedby`.

import { useId, type ReactNode } from 'react';

export default function InfoHint({
  label,
  title,
  children
}: {
  /** Accessible name for the trigger (what the hint explains). */
  label: string;
  /** Optional bold heading shown at the top of the tooltip. */
  title?: string;
  /** Tooltip body. */
  children: ReactNode;
}) {
  const id = useId();
  return (
    <span className="info-hint">
      <button
        type="button"
        className="info-hint-btn"
        aria-label={label}
        aria-describedby={id}
      >
        ⓘ
      </button>
      <span className="info-hint-pop" id={id} role="tooltip">
        {title && <span className="info-hint-title">{title}</span>}
        {children}
      </span>
    </span>
  );
}
