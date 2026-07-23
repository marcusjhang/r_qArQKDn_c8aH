'use client';

// Inline "add stage" — a text input with a live duplicate guard.

import { useEffect, useRef, useState } from 'react';
import { validateStageName, MAX_STAGE_NAME, type Job } from '@/lib/hiring';
import { Button } from '@/components/ui/button';

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
      <button className="add-stage" onClick={() => setAdding(true)}>
        ＋ Add stage
      </button>
    );
  }

  return (
    <div className="add-stage-form">
      <input
        ref={inputRef}
        type="text"
        placeholder="Stage name"
        maxLength={MAX_STAGE_NAME}
        value={name}
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
      {error && <div className="form-error">{error}</div>}
      <div className="add-stage-actions">
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
