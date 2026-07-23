'use client';

// Create a new job (pipeline). You can paste the job description (JD) and,
// optionally, let AI suggest the important traits to score candidates on before
// the job is created. The job starts with the compulsory default stages; the
// board switches to it once created.

import { useRef, useState } from 'react';
import {
  validateTraitName,
  mergeTraitSuggestions,
  MAX_JOB_DESCRIPTION,
  MAX_TRAIT_NAME
} from '@/lib/hiring';
// recommendTraits is a server action; the `@/lib/hiring` barrel deliberately
// excludes actions/, so it is imported from that module directly.
import { recommendTraits } from '@/lib/hiring/actions';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import Modal from './Modal';

export default function NewJobModal({
  aiEnabled = false,
  onClose,
  onCreate
}: {
  /** Whether the AI trait recommender is configured; hides Suggest when false. */
  aiEnabled?: boolean;
  onClose: () => void;
  onCreate: (title: string, description: string, traits: string[]) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [traits, setTraits] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [traitName, setTraitName] = useState('');
  const [traitError, setTraitError] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestMsg, setSuggestMsg] = useState('');
  const traitInputRef = useRef<HTMLInputElement>(null);

  // Add a trait manually (validated, unique) — nested inside the create-job
  // form, so this is a plain handler rather than its own <form> submit.
  function addTrait() {
    const check = validateTraitName(traits, traitName);
    if (!check.ok) {
      setTraitError(check.reason);
      return;
    }
    setTraits((cur) => [...cur, traitName.trim()]);
    setTraitName('');
    setTraitError('');
    traitInputRef.current?.focus();
  }

  async function suggest() {
    const t = title.trim();
    if (!t) {
      setError('Enter a job title first.');
      return;
    }
    setSuggesting(true);
    setSuggestMsg('');
    try {
      const picks = await recommendTraits(t, description.trim());
      if (!picks.length) {
        setSuggestMsg('No suggestions. Add traits manually or try again.');
        return;
      }
      const { traits: next, added } = mergeTraitSuggestions(traits, picks);
      if (added) setTraits(next);
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

  function removeTrait(index: number) {
    setTraits((cur) => cur.filter((_, i) => i !== index));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Enter a job title.');
      return;
    }
    onCreate(trimmed, description.trim(), traits);
    onClose();
  }

  return (
    <Modal title="New job" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="newjob-title">
            Job title
          </label>
          <input
            id="newjob-title"
            type="text"
            autoFocus
            maxLength={80}
            value={title}
            placeholder="e.g. Founding Engineer"
            onChange={(e) => {
              setTitle(e.target.value);
              setError('');
            }}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="newjob-jd">
            Job description (optional)
          </label>
          <textarea
            id="newjob-jd"
            className="jd-textarea"
            maxLength={MAX_JOB_DESCRIPTION}
            value={description}
            placeholder={
              aiEnabled
                ? 'Paste the job description. AI can suggest traits from it.'
                : 'Paste the job description.'
            }
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="field">
          <div className="suggest-head">
            <span className="label">Important traits</span>
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
          {traits.length > 0 && (
            <div className="trait-chips">
              {traits.map((t, i) => (
                <span className="trait-chip" key={`${t}-${i}`}>
                  {t}
                  <button
                    type="button"
                    className="chip-x"
                    aria-label={`Remove ${t}`}
                    onClick={() => removeTrait(i)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="add-trait-row">
            <input
              ref={traitInputRef}
              type="text"
              maxLength={MAX_TRAIT_NAME}
              value={traitName}
              placeholder="Add a trait, e.g. Systems design"
              onChange={(e) => {
                setTraitName(e.target.value);
                setTraitError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTrait();
                }
              }}
            />
            <Button type="button" variant="app" onClick={addTrait}>
              Add
            </Button>
          </div>
          {traitError && <div className="form-error">{traitError}</div>}
          {traits.length === 0 && (
            <p className="settings-sub">
              {aiEnabled
                ? 'Add traits here, or later from the Traits button. AI can suggest a few from the title and JD.'
                : 'Add traits here, or later from the Traits button.'}
            </p>
          )}
          {suggestMsg && <div className="settings-sub">{suggestMsg}</div>}
        </div>

        <FormError message={error} />
        <div className="modal-actions">
          <Button type="button" variant="app" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="appPrimary">
            Create job
          </Button>
        </div>
      </form>
    </Modal>
  );
}
