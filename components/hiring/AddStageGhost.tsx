'use client';

// Inline "add stage" control: a ghost button that expands into a text input
// with a live validation guard. Form state lives in useAddStageForm.

import { validateStageName, MAX_STAGE_NAME, type Job } from '@/lib/hiring';
import { useAddStageForm } from '@/lib/hiring/hooks';

export default function AddStageGhost({
  job,
  onAdd
}: {
  job: Job;
  onAdd: (name: string) => void;
}) {
  const form = useAddStageForm({
    validate: (name) => validateStageName(job.stages, name),
    onAdd
  });

  if (!form.isAdding) {
    return (
      <button className="add-stage" onClick={form.open}>
        ＋ Add stage
      </button>
    );
  }

  return (
    <div className="add-stage-form">
      <input
        ref={form.inputRef}
        type="text"
        placeholder="Stage name"
        maxLength={MAX_STAGE_NAME}
        value={form.name}
        onChange={(e) => form.changeName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            form.submit();
          } else if (e.key === 'Escape') {
            form.reset();
          }
        }}
      />
      {form.error && <div className="form-error">{form.error}</div>}
      <div className="add-stage-actions">
        <button type="button" className="btn" onClick={form.reset}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={form.submit}>
          Add
        </button>
      </div>
    </div>
  );
}
