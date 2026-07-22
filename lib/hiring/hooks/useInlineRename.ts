'use client';

// Inline-rename orchestration for a `contentEditable` element (used by the
// column stage title). Commits on blur, reverts the DOM to `value` on an empty,
// no-op or rejected edit, and handles Enter (commit) / Escape (cancel).

import { useRef } from 'react';
import type { KeyboardEvent } from 'react';

interface InlineRename {
  /** Attach to the editable element. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Focus the element and select its contents, ready to type. */
  start: () => void;
  /** Commit (or revert) the current text; call from onBlur. */
  commit: (el: HTMLElement) => void;
  /** Enter commits, Escape reverts — call from onKeyDown. */
  handleKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}

export function useInlineRename({
  value,
  isValid,
  onCommit
}: {
  /** The canonical value the element should show / revert to. */
  value: string;
  /** Whether `text` is an acceptable new value. */
  isValid: (text: string) => boolean;
  /** Persist an accepted edit. */
  onCommit: (text: string) => void;
}): InlineRename {
  const ref = useRef<HTMLDivElement>(null);

  function commit(el: HTMLElement) {
    const text = (el.textContent ?? '').trim();
    // Revert on no-op or anything the validator rejects.
    if (text === value || !isValid(text)) {
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

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.currentTarget.textContent = value;
      e.currentTarget.blur();
    }
  }

  return { ref, start, commit, handleKeyDown };
}
