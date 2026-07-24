'use client';

// One ranked trait row, shared by the New Job and Traits modals: the rank, a
// click-to-rename name (inline contentEditable), up/down reorder, and remove.
// Order is the ranking, so the reorder controls are how a founder ranks traits
// both while creating a job and while editing one later.

import { validateTraitName } from '@/lib/hiring';
import { ArrowUp, ArrowDown, X } from 'lucide-react';
import { useInlineEdit } from './hooks/useInlineEdit';

export default function TraitRow({
  trait,
  index,
  total,
  otherTraits,
  onRename,
  onReorder,
  onRemove
}: {
  trait: string;
  index: number;
  total: number;
  /** The other traits, so a rename can keep its own name and skip the cap. */
  otherTraits: string[];
  onRename: (index: number, name: string) => void;
  onReorder: (index: number, dir: 1 | -1) => void;
  onRemove: (index: number) => void;
}) {
  const edit = useInlineEdit({
    value: trait,
    validate: (text) => validateTraitName(otherTraits, text).ok,
    onCommit: (text) => onRename(index, text)
  });
  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-[7px]">
      <span className="min-w-[22px] text-[11px] font-bold text-muted-foreground">
        #{index + 1}
      </span>
      <div
        className="min-w-0 flex-1 text-[13px] text-foreground"
        ref={edit.ref}
        role="textbox"
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        title="Click to rename this trait"
        onBlur={edit.onBlur}
        onKeyDown={edit.onKeyDown}
      >
        {trait}
      </div>
      <span className="flex flex-[0_0_auto] gap-0.5">
        <button
          type="button"
          className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md border border-border-strong bg-surface text-[11px] leading-none text-muted-foreground enabled:hover:border-primary enabled:hover:text-primary"
          aria-label={`Move ${trait} up`}
          disabled={index === 0}
          onClick={() => onReorder(index, -1)}
        >
          <ArrowUp size={14} aria-hidden />
        </button>
        <button
          type="button"
          className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md border border-border-strong bg-surface text-[11px] leading-none text-muted-foreground enabled:hover:border-primary enabled:hover:text-primary"
          aria-label={`Move ${trait} down`}
          disabled={index === total - 1}
          onClick={() => onReorder(index, 1)}
        >
          <ArrowDown size={14} aria-hidden />
        </button>
      </span>
      <button
        type="button"
        className="inline-flex h-[22px] w-[22px] flex-[0_0_auto] items-center justify-center rounded-full border-0 bg-surface-2 text-xs leading-none text-muted-foreground hover:bg-rej-bg hover:text-rej"
        aria-label={`Remove ${trait}`}
        onClick={() => onRemove(index)}
      >
        <X size={14} aria-hidden />
      </button>
    </li>
  );
}
