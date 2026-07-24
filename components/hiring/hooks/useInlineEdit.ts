'use client';

// Inline contentEditable editing (board stage rename). On blur/Enter the trimmed text is validated and committed, else reverted to `value`; Escape always reverts.

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
