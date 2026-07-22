'use client';

// Add-candidate form (Decision 6): name + source + owner in one step, with
// valid-by-construction selects instead of free-text prompts. LinkedIn and
// GitHub URLs are optional; blank inputs are stored as NULL.

import { useState } from 'react';
import {
  USERS,
  SOURCES,
  MAX_PROFILE_URL,
  normalizeProfileUrl
} from '@/lib/hiring';
import Modal from './Modal';

export default function AddCandidateModal({
  jobTitle,
  onClose,
  onAdd
}: {
  jobTitle: string;
  onClose: () => void;
  onAdd: (
    name: string,
    source: string,
    owner: string,
    linkedinUrl: string | null,
    githubUrl: string | null
  ) => void;
}) {
  const [name, setName] = useState('');
  const [source, setSource] = useState(SOURCES[0]);
  const [owner, setOwner] = useState(USERS[0].id);
  const [linkedin, setLinkedin] = useState('');
  const [github, setGithub] = useState('');
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a candidate name.');
      return;
    }
    const li = normalizeProfileUrl(linkedin);
    if (!li.ok) {
      setError('LinkedIn must be a valid http(s) URL.');
      return;
    }
    const gh = normalizeProfileUrl(github);
    if (!gh.ok) {
      setError('GitHub must be a valid http(s) URL.');
      return;
    }
    onAdd(trimmed, source, owner, li.value, gh.value);
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
              {USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <span className="label">LinkedIn URL (optional)</span>
          <input
            type="url"
            maxLength={MAX_PROFILE_URL}
            value={linkedin}
            onChange={(e) => {
              setLinkedin(e.target.value);
              setError('');
            }}
            placeholder="https://www.linkedin.com/in/…"
          />
        </div>
        <div className="field">
          <span className="label">GitHub URL (optional)</span>
          <input
            type="url"
            maxLength={MAX_PROFILE_URL}
            value={github}
            onChange={(e) => {
              setGithub(e.target.value);
              setError('');
            }}
            placeholder="https://github.com/…"
          />
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
