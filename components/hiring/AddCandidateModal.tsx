'use client';

// Add-candidate form (Decision 6): name + source + owner in one step, with
// valid-by-construction selects instead of free-text prompts.

import { useState } from 'react';
import { FOUNDERS, SOURCES } from '@/lib/hiring/config';
import Modal from './Modal';

export default function AddCandidateModal({
  jobTitle,
  onClose,
  onAdd
}: {
  jobTitle: string;
  onClose: () => void;
  onAdd: (name: string, source: string, owner: string) => void;
}) {
  const [name, setName] = useState('');
  const [source, setSource] = useState(SOURCES[0]);
  const [owner, setOwner] = useState(FOUNDERS[0].id);
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a candidate name.');
      return;
    }
    onAdd(trimmed, source, owner);
    onClose();
  }

  return (
    <Modal title={`Add candidate to ${jobTitle}`} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="field">
          <span className="label">Name</span>
          <input
            type="text"
            autoFocus
            maxLength={120}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            placeholder="Full name"
          />
        </div>
        <div className="field-row">
          <div className="field">
            <span className="label">Source</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="label">Owner</span>
            <select value={owner} onChange={(e) => setOwner(e.target.value)}>
              {FOUNDERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Add candidate
          </button>
        </div>
      </form>
    </Modal>
  );
}
