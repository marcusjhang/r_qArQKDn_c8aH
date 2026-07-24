'use client';

// Create a new job (pipeline). You can paste the job description (JD) and set
// the important traits (manually or, when configured, via AI) before the job is
// created. The traits UI is the shared TraitsEditor — identical to the Traits
// modal — wired here to local state; the job starts with the default stages and
// the board switches to it once created.

import { useState } from 'react';
import {
  mergeTraitSuggestions,
  reorderStages,
  MAX_JOB_DESCRIPTION
} from '@/lib/hiring';
// recommendTraits is a server action; the `@/lib/hiring` barrel deliberately
// excludes actions/, so it is imported from that module directly.
import { recommendTraits } from '@/lib/hiring/actions';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import Modal from './Modal';
import TraitsEditor from './TraitsEditor';

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
  const [suggesting, setSuggesting] = useState(false);
  const [suggestMsg, setSuggestMsg] = useState('');

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
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-col gap-1.5">
          <label
            className="text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground"
            htmlFor="newjob-title"
          >
            Job title
          </label>
          <input
            id="newjob-title"
            type="text"
            autoFocus
            maxLength={80}
            value={title}
            placeholder="e.g. Founding Engineer"
            className="w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(e) => {
              setTitle(e.target.value);
              setError('');
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            className="text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground"
            htmlFor="newjob-jd"
          >
            Job description (optional)
          </label>
          <textarea
            id="newjob-jd"
            className="max-h-[260px] min-h-[96px] w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

        <TraitsEditor
          traits={traits}
          aiEnabled={aiEnabled}
          suggesting={suggesting}
          suggestMsg={suggestMsg}
          onChange={setTraits}
          onReorder={reorderTrait}
          onSuggest={suggest}
        />

        <FormError message={error} />
        <div className="flex justify-end gap-2">
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
