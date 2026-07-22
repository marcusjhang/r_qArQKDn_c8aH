'use client';

// Inline contentEditable field editing (used for the board's stage rename).
// Owns the DOM interaction only — the caller supplies the current value, a
// validator, and a commit callback. On blur/Enter the trimmed text is
// validated and committed, or the element is reverted to `value`; Escape
// always reverts. Keeping this out of the component removes the fiddly
// selection/commit/revert branching from the render path.

import { useRef, type KeyboardEvent } from 'react';

export interface InlineEdit {
  /** Ref to attach to the contentEditable element. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Focus the element and select its contents, ready for editing. */
  start: () => void;
  /** Commit-on-blur handler. */
  onBlur: (e: React.FocusEvent<HTMLDivElement>) => void;
  /** Enter-to-commit / Escape-to-revert handler. */
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}

export function useInlineEdit(opts: {
  value: string;
  validate: (text: string) => boolean;
  onCommit: (text: string) => void;
}): InlineEdit {
  const { value, validate, onCommit } = opts;
  const ref = useRef<HTMLDivElement>(null);

  function commit(el: HTMLElement) {
    const text = (el.textContent ?? '').trim();
    // Revert on no-op or anything the validator rejects.
    if (text === value || !validate(text)) {
      el.textContent = value;
      return;
    }
    onCommit(text);
  }

  function start() {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  return {
    ref,
    start,
    onBlur: (e) => commit(e.currentTarget),
    onKeyDown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        e.currentTarget.textContent = value;
        e.currentTarget.blur();
      }
    }
  };
}
