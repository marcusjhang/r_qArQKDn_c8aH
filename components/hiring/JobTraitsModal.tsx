'use client';

// Manage a job's description (JD) and the important traits it's scored on.
// Traits are per-job (like stages): the hiring team adds the qualities to look
// out for here, then scores each candidate against them in the feedback form.
// Trait order is the ranking (rank #1 counts most); up/down re-rank, the name is
// click-to-rename inline, and ✕ removes. When the AI recommender is configured
// it can suggest a focused few from the title + JD. Changes persist immediately
// through the store (setJobTraits / setJobDescription / reorderTrait per edit).

import { useRef, useState } from 'react';
import {
  validateTraitName,
  mergeTraitSuggestions,
  MAX_JOB_DESCRIPTION,
  MAX_TRAIT_NAME
} from '@/lib/hiring';
import { recommendTraits } from '@/lib/hiring/actions';
import { Button } from '@/components/ui/button';
import Modal from './Modal';
import InfoHint from './InfoHint';
import { useInlineEdit } from './hooks/useInlineEdit';

/** One ranked trait: rank, click-to-rename name, reorder, remove. */
function TraitRow({
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
  otherTraits: string[];
  onRename: (index: number, name: string) => void;
  onReorder: (index: number, dir: 1 | -1) => void;
  onRemove: (index: number) => void;
}) {
  // Rename is validated against the *other* traits so a trait can keep its own
  // name, and the cap check never fires (renaming does not grow the list).
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

export default function JobTraitsModal({
  jobTitle,
  traits,
  description,
  aiEnabled = false,
  onChange,
  onReorder,
  onDescriptionChange,
  onClose
}: {
  jobTitle: string;
  traits: string[];
  description: string;
  /** Whether the AI trait recommender is configured; hides Suggest when false. */
  aiEnabled?: boolean;
  onChange: (next: string[]) => void;
  onReorder: (index: number, dir: 1 | -1) => void;
  onDescriptionChange: (description: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [jd, setJd] = useState(description);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestMsg, setSuggestMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function addTrait(e: React.FormEvent) {
    e.preventDefault();
    const check = validateTraitName(traits, name);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    onChange([...traits, name.trim()]);
    setName('');
    setError('');
    inputRef.current?.focus();
  }

  // Persist the JD on blur only when it actually changed.
  function commitJd() {
    if (jd.trim() !== description.trim()) onDescriptionChange(jd.trim());
  }

  async function suggest() {
    setSuggesting(true);
    setSuggestMsg('');
    try {
      const picks = await recommendTraits(jobTitle, jd.trim());
      if (!picks.length) {
        setSuggestMsg('No suggestions. Add traits manually or try again.');
        return;
      }
      const { traits: next, added } = mergeTraitSuggestions(traits, picks);
      if (added) onChange(next);
      setSuggestMsg(
        added
          ? `Added ${added} suggested trait${added === 1 ? '' : 's'}.`
          : 'Those suggestions are already in your list.'
      );
    } catch {
      setSuggestMsg('Could not reach the AI service.');
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <Modal title={`Traits · ${jobTitle}`} onClose={onClose}>
      <div className="modal-form">
        <div className="field">
          <label className="label" htmlFor="jobtraits-jd">
            Job description (JD)
          </label>
          <textarea
            id="jobtraits-jd"
            className="jd-textarea"
            maxLength={MAX_JOB_DESCRIPTION}
            value={jd}
            placeholder={
              aiEnabled
                ? 'Paste the JD. AI can suggest traits from it.'
                : 'Paste the job description.'
            }
            onChange={(e) => setJd(e.target.value)}
            onBlur={commitJd}
          />
        </div>

        <div className="field">
          <div className="suggest-head">
            <span className="label label-hint">
              Important traits
              <InfoHint label="How ranking works" title="How ranking works">
                <p>
                  Drag rank with the arrows: rank #1 is the most important. A
                  candidate&rsquo;s overall score weights each trait by its
                  rank, so higher traits count for more.
                </p>
              </InfoHint>
            </span>
            {aiEnabled && (
              <Button
                type="button"
                variant="app"
                disabled={suggesting}
                onClick={suggest}
              >
                {suggesting ? 'Thinking…' : '✨ Suggest from JD'}
              </Button>
            )}
          </div>
          {traits.length === 0 ? (
            <p className="settings-sub">No traits yet. Add the first below.</p>
          ) : (
            <ol className="trait-list">
              {traits.map((t, i) => (
                <TraitRow
                  key={`${t}-${i}`}
                  trait={t}
                  index={i}
                  total={traits.length}
                  otherTraits={traits.filter((_, j) => j !== i)}
                  onRename={(idx, next) =>
                    onChange(traits.map((x, j) => (j === idx ? next : x)))
                  }
                  onReorder={onReorder}
                  onRemove={(idx) =>
                    onChange(traits.filter((_, j) => j !== idx))
                  }
                />
              ))}
            </ol>
          )}
          {suggestMsg && <div className="settings-sub">{suggestMsg}</div>}
        </div>

        <form className="add-trait-row" onSubmit={addTrait}>
          <input
            ref={inputRef}
            type="text"
            maxLength={MAX_TRAIT_NAME}
            value={name}
            placeholder="Add a trait, e.g. Systems design"
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
          />
          <Button type="submit" variant="app">
            Add
          </Button>
        </form>
        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <Button type="button" variant="appPrimary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
