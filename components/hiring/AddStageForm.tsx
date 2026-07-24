'use client';

// Inline "add stage" — a text input with a live duplicate guard.

import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { validateStageName, MAX_STAGE_NAME, type Job } from '@/lib/hiring';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';

export default function AddStageForm({
  job,
  onAdd
}: {
  job: Job;
  onAdd: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function reset() {
    setName('');
    setError('');
    setAdding(false);
  }

  function submit() {
    const check = validateStageName(job.stages, name);
    if (!check.ok) {
      setError(check.reason ?? 'Invalid stage name.');
      return;
    }
    onAdd(name.trim());
    reset();
  }

  if (!adding) {
    return (
      <button
        className="flex flex-none basis-[150px] items-start justify-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-border-strong bg-transparent p-3 text-[13px] font-medium text-muted-foreground min-h-[56px] hover:border-primary hover:bg-primary-weak hover:text-primary"
        onClick={() => setAdding(true)}
      >
        <Plus size={14} aria-hidden /> Add stage
      </button>
    );
  }

  return (
    <div className="flex flex-none basis-[200px] flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <input
        ref={inputRef}
        type="text"
        placeholder="Stage name"
        maxLength={MAX_STAGE_NAME}
        value={name}
        className="w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-weak)] focus:outline-none"
        onChange={(e) => {
          setName(e.target.value);
          setError('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            reset();
          }
        }}
      />
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="app" onClick={reset}>
          Cancel
        </Button>
        <Button type="button" variant="appPrimary" onClick={submit}>
          Add
        </Button>
      </div>
    </div>
  );
}
