'use client';

// Create a new job (pipeline). The job is created with the compulsory default
// stages; the board switches to it once created.

import { useState } from 'react';
import { DEFAULT_STAGES } from '@/lib/hiring';
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
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Create job
          </button>
        </div>
      </form>
    </Modal>
  );
}
