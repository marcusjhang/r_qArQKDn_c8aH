'use client';

// Add-candidate form (Decision 6): name + source + owner in one step, with
// valid-by-construction selects instead of free-text prompts. LinkedIn and
// GitHub URLs are optional; blank inputs are stored as NULL. Years of
// experience is optional too and drives the seniority band shown on the card.

import { useState } from 'react';
import {
  MAX_PROFILE_URL,
  LINKEDIN_URL_PLACEHOLDER,
  GITHUB_URL_PLACEHOLDER,
  normalizeProfileUrl,
  MAX_YEARS_EXPERIENCE,
  parseYearsInput,
  seniorityFor,
  displayName,
  type User,
  type Source,
  type SeniorityBand
} from '@/lib/hiring';
import Modal from './Modal';

export default function AddCandidateModal({
  jobTitle,
  users,
  sources,
  bands,
  onClose,
  onAdd
}: {
  jobTitle: string;
  users: User[];
  sources: Source[];
  bands: SeniorityBand[];
  onClose: () => void;
  onAdd: (
    name: string,
    source: number,
    owner: number,
    linkedinUrl: string | null,
    githubUrl: string | null,
    yearsExperience: number | null
  ) => void;
}) {
  const [name, setName] = useState('');
  const [source, setSource] = useState<number>(sources[0]?.id ?? 0);
  const [owner, setOwner] = useState<number>(users[0]?.id ?? 0);
  const [linkedin, setLinkedin] = useState('');
  const [github, setGithub] = useState('');
  // Empty string = unspecified; otherwise a whole number of years.
  const [years, setYears] = useState('');
  const [error, setError] = useState('');

  const parsedYears = parseYearsInput(years);
  const seniority = seniorityFor(bands, parsedYears.value);

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
    if (!parsedYears.ok) {
      setError(
        `Years of experience must be a whole number 0–${MAX_YEARS_EXPERIENCE}.`
      );
      return;
    }
    onAdd(trimmed, source, owner, li.value, gh.value, parsedYears.value);
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
            <select
              value={source}
              onChange={(e) => setSource(Number(e.target.value))}
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="label">Owner</span>
            <select
              value={owner}
              onChange={(e) => setOwner(Number(e.target.value))}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {displayName(u)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <span className="label">Years of experience</span>
          <div className="years-row">
            <input
              className="years-input"
              type="number"
              min={0}
              max={MAX_YEARS_EXPERIENCE}
              step={1}
              value={years}
              onChange={(e) => {
                setYears(e.target.value);
                setError('');
              }}
              placeholder="Optional — e.g. 5"
            />
            {seniority && <span className="exp-tag">{seniority}</span>}
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
            placeholder={LINKEDIN_URL_PLACEHOLDER}
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
            placeholder={GITHUB_URL_PLACEHOLDER}
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
