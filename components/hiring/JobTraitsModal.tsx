'use client';

// Manage a job's description (JD) and the important traits it's scored on. The
// traits UI itself (label, ranking/formula hints, AI suggest, ranked list, add
// row) is the shared TraitsEditor — identical to the one in the New Job modal;
// this wrapper adds the editable JD and wires the editor to the store
// (setJobTraits / setJobDescription / reorderTrait per edit).

import { useState } from 'react';
import { mergeTraitSuggestions, MAX_JOB_DESCRIPTION } from '@/lib/hiring';
import { recommendTraits } from '@/lib/hiring/actions';
import { Button } from '@/components/ui/button';
import Modal from './Modal';
import TraitsEditor from './TraitsEditor';

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
  const [jd, setJd] = useState(description);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestMsg, setSuggestMsg] = useState('');

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
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            className="text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground"
            htmlFor="jobtraits-jd"
          >
            Job description (JD)
          </label>
          <textarea
            id="jobtraits-jd"
            className="max-h-[260px] min-h-[96px] w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

        <TraitsEditor
          traits={traits}
          aiEnabled={aiEnabled}
          suggesting={suggesting}
          suggestMsg={suggestMsg}
          onChange={onChange}
          onReorder={onReorder}
          onSuggest={suggest}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="appPrimary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
