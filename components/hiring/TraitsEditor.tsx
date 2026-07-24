'use client';

// The per-job traits editor, shared by the New Job and Traits modals so both
// surfaces are identical: the "Traits" label with the ranking (ⓘ) and formula
// (calculator) hints, the optional AI "Suggest from JD" action, the ranked
// reorderable/renamable list (TraitRow), and the add-a-trait input. The owner
// passes the current traits plus the callbacks that persist them — a store
// action for an existing job, or local state for a job being created.

import { useRef, useState } from 'react';
import { validateTraitName, MAX_TRAIT_NAME } from '@/lib/hiring';
import { Calculator, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import InfoHint from './InfoHint';
import TraitRow from './TraitRow';

export default function TraitsEditor({
  traits,
  aiEnabled,
  suggesting,
  suggestMsg,
  onChange,
  onReorder,
  onSuggest
}: {
  traits: string[];
  /** Whether the AI recommender is configured; hides Suggest when false. */
  aiEnabled: boolean;
  /** Whether an AI suggestion is in flight (disables Suggest). */
  suggesting: boolean;
  /** Status line under the list after a suggest attempt. */
  suggestMsg: string;
  /** Replace the whole trait list (add / rename / remove). */
  onChange: (next: string[]) => void;
  /** Move the trait at `index` one step in `dir` (the ranking). */
  onReorder: (index: number, dir: 1 | -1) => void;
  /** Kick off an AI suggestion (only rendered when `aiEnabled`). */
  onSuggest: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // The add row is a plain handler (not a <form>) because this editor renders
  // inside the New Job modal's create-job form, and forms cannot nest.
  function addTrait() {
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

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground">
          Traits
          <InfoHint label="How ranking works" title="How ranking works">
            <p>
              Use the arrows to rank: rank #1 is the most important. A
              candidate&rsquo;s overall score weights each trait by its rank, so
              higher traits count for more.
            </p>
          </InfoHint>
          <InfoHint
            label="Show the scoring formula"
            title="Formula"
            trigger={<Calculator size={14} aria-hidden />}
          >
            <p>
              Each trait&rsquo;s score is the average of its 1 to 4 ratings
              across all feedback.
            </p>
            <p className="font-mono text-[11.5px] text-muted-foreground">
              overall = sum(weight &times; trait average) / sum(weights)
            </p>
            <p>A trait at rank #k of N has weight N + 1 - k.</p>
          </InfoHint>
        </span>
        {aiEnabled && (
          <Button
            type="button"
            variant="app"
            disabled={suggesting}
            onClick={onSuggest}
          >
            {suggesting ? (
              'Thinking…'
            ) : (
              <>
                <Sparkles size={14} aria-hidden /> Suggest from JD
              </>
            )}
          </Button>
        )}
      </div>

      {traits.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
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
              onRemove={(idx) => onChange(traits.filter((_, j) => j !== idx))}
            />
          ))}
        </ol>
      )}

      <div className="flex items-stretch gap-2">
        <input
          ref={inputRef}
          type="text"
          maxLength={MAX_TRAIT_NAME}
          value={name}
          placeholder="Add a trait, e.g. Systems design"
          className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(e) => {
            setName(e.target.value);
            setError('');
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
      {error && <div className="text-xs text-sno">{error}</div>}
      {suggestMsg && (
        <div className="m-0 text-[12.5px] text-muted-foreground">{suggestMsg}</div>
      )}
    </div>
  );
}
