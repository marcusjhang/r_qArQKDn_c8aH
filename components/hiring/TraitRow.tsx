'use client';

// One ranked trait row, shared by the New Job and Traits modals: the rank, a
// click-to-rename name (inline contentEditable), up/down reorder, and remove.
// Order is the ranking, so the reorder controls are how a founder ranks traits
// both while creating a job and while editing one later.

import { validateTraitName } from '@/lib/hiring';
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
    <li className="trait-row">
      <span className="trait-rank">#{index + 1}</span>
      <div
        className="trait-name"
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
      <span className="trait-rank-btns">
        <button
          type="button"
          className="rank-btn"
          aria-label={`Move ${trait} up`}
          disabled={index === 0}
          onClick={() => onReorder(index, -1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="rank-btn"
          aria-label={`Move ${trait} down`}
          disabled={index === total - 1}
          onClick={() => onReorder(index, 1)}
        >
          ↓
        </button>
      </span>
      <button
        type="button"
        className="trait-remove"
        aria-label={`Remove ${trait}`}
        onClick={() => onRemove(index)}
      >
        ✕
      </button>
    </li>
  );
}
