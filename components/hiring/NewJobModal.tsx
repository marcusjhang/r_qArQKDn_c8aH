'use client';

// Create a new job (pipeline). You can paste the job description (JD) and,
// optionally, let AI suggest the important traits to score candidates on before
// the job is created. The job starts with the compulsory default stages; the
// board switches to it once created.

import { useRef, useState } from 'react';
import {
  validateTraitName,
  mergeTraitSuggestions,
  reorderStages,
  MAX_JOB_DESCRIPTION,
  MAX_TRAIT_NAME
} from '@/lib/hiring';
// recommendTraits is a server action; the `@/lib/hiring` barrel deliberately
// excludes actions/, so it is imported from that module directly.
import { recommendTraits } from '@/lib/hiring/actions';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import Modal from './Modal';
import TraitRow from './TraitRow';

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

  // Reorder is the ranking: order 0 is rank #1. Reuses the shared ordered-list
  // helper so the local list ranks the same way the server actions do.
  function reorderTrait(index: number, dir: 1 | -1) {
    setTraits((cur) => {
      const result = reorderStages(cur, index, dir);
      return result.ok ? result.stages : cur;
    });
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
            <span className="label">Traits</span>
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
            <ol className="trait-list">
              {traits.map((t, i) => (
                <TraitRow
                  key={`${t}-${i}`}
                  trait={t}
                  index={i}
                  total={traits.length}
                  otherTraits={traits.filter((_, j) => j !== i)}
                  onRename={(idx, name) =>
                    setTraits((cur) =>
                      cur.map((x, j) => (j === idx ? name : x))
                    )
                  }
                  onReorder={reorderTrait}
                  onRemove={(idx) =>
                    setTraits((cur) => cur.filter((_, j) => j !== idx))
                  }
                />
              ))}
            </ol>
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
