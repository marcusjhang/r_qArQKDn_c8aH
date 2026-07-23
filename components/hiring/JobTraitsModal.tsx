'use client';

// Manage a job's description (JD) and the important traits it's scored on.
// Traits are per-job (like stages): the hiring team adds the qualities to look
// out for here, then scores each candidate against them in the feedback form.
// The JD can be edited after creation, and AI can suggest a focused few from
// the title + JD. Trait order is the ranking (rank #1 = most weight); up/down
// re-rank. Changes persist immediately through the store (setJobTraits /
// setJobDescription / reorderTrait per edit).

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

export default function JobTraitsModal({
  jobTitle,
  traits,
  description,
  onChange,
  onReorder,
  onDescriptionChange,
  onClose
}: {
  jobTitle: string;
  traits: string[];
  description: string;
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

  function removeTrait(index: number) {
    onChange(traits.filter((_, i) => i !== index));
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
            placeholder="Paste the JD here — the AI uses it to suggest traits."
            onChange={(e) => setJd(e.target.value)}
            onBlur={commitJd}
          />
        </div>

        <div className="field">
          <div className="suggest-head">
            <span className="label">
              Important traits — higher rank counts for more
            </span>
            <Button
              type="button"
              variant="app"
              disabled={suggesting}
              onClick={suggest}
            >
              {suggesting ? 'Thinking…' : '✨ Suggest from JD'}
            </Button>
          </div>
          {traits.length === 0 ? (
            <p className="settings-sub">No traits yet. Add the first below.</p>
          ) : (
            <ol className="trait-rank-list">
              {traits.map((t, i) => (
                <li className="trait-rank-row" key={`${t}-${i}`}>
                  <span className="trait-rank">#{i + 1}</span>
                  <span className="trait-rank-name">{t}</span>
                  <span className="trait-rank-controls">
                    <button
                      type="button"
                      className="rank-btn"
                      aria-label={`Move ${t} up`}
                      disabled={i === 0}
                      onClick={() => onReorder(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="rank-btn"
                      aria-label={`Move ${t} down`}
                      disabled={i === traits.length - 1}
                      onClick={() => onReorder(i, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="chip-x"
                      aria-label={`Remove ${t}`}
                      onClick={() => removeTrait(i)}
                    >
                      ✕
                    </button>
                  </span>
                </li>
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
