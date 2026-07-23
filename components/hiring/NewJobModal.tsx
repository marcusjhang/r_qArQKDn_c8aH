'use client';

// Create a new job (pipeline). The job is created with the compulsory default
// stages; the board switches to it once created.

import { useState } from 'react';
import { DEFAULT_STAGES } from '@/lib/hiring';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import Modal from './Modal';

export default function NewJobModal({
  onClose,
  onCreate
}: {
  onClose: () => void;
  onCreate: (title: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Enter a job title.');
      return;
    }
    onCreate(trimmed);
    onClose();
  }

  return (
    <Modal title="New job" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="newjob-title">Job title</label>
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
        <p className="settings-sub">
          Starts with the default stages: {DEFAULT_STAGES.join(' → ')}.
        </p>
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
