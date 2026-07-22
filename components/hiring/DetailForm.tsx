'use client';

// Candidate details in the drawer, laid out like the add-candidate form:
// Name, Source + Owner, years of experience, and the optional LinkedIn / GitHub
// links. The section is read-only until Edit is pressed, then Save/Cancel; one
// editCandidate call persists all fields. Status stays a separate, always-live
// control (it's a pipeline action, not part of the candidate's identity).

import { useEffect, useState } from 'react';
import {
  STATUS,
  MAX_PROFILE_URL,
  normalizeProfileUrl,
  LINKEDIN_URL_PLACEHOLDER,
  GITHUB_URL_PLACEHOLDER,
  MAX_YEARS_EXPERIENCE,
  parseYearsInput,
  seniorityFor,
  displayName,
  type HiringActions,
  type Candidate,
  type Status,
  type User,
  type Source,
  type SeniorityBand
} from '@/lib/hiring';

/** Canonical text form of a stored years value (null → empty string). */
function yearsToText(years: number | null | undefined): string {
  return years == null ? '' : String(years);
}

export default function DetailForm({
  view,
  actions,
  users,
  sources,
  bands,
  resetKey
}: {
  view: Candidate | null;
  actions: HiringActions;
  users: User[];
  sources: Source[];
  bands: SeniorityBand[];
  /** Identity of the open candidate (openId) — the form resets when it changes. */
  resetKey: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [dName, setDName] = useState('');
  const [dSource, setDSource] = useState<number>(sources[0]?.id ?? 0);
  const [dOwner, setDOwner] = useState<number>(users[0]?.id ?? 0);
  const [dLinkedin, setDLinkedin] = useState('');
  const [dGithub, setDGithub] = useState('');
  const [dYears, setDYears] = useState('');
  const [error, setError] = useState('');

  function seedDraft(c: Candidate | null) {
    setDName(c?.name ?? '');
    setDSource(c?.source ?? sources[0]?.id ?? 0);
    setDOwner(c?.owner ?? users[0]?.id ?? 0);
    setDLinkedin(c?.linkedinUrl ?? '');
    setDGithub(c?.githubUrl ?? '');
    setDYears(yearsToText(c?.yearsExperience));
    setError('');
  }

  // Leave edit mode and re-seed the draft whenever the drawer opens a different
  // candidate (or closes). Keyed on openId — which flips on open/close/switch —
  // rather than view?.id: view falls back to the last-shown candidate during
  // the slide-out, so keying on its id would leave a reopened candidate stuck
  // in edit mode; and an optimistic update to the open candidate must NOT reset
  // an in-progress edit.
  useEffect(() => {
    setEditing(false);
    seedDraft(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const detailsDirty =
    !!view &&
    (dName.trim() !== view.name ||
      dSource !== view.source ||
      dOwner !== view.owner ||
      dLinkedin.trim() !== (view.linkedinUrl ?? '') ||
      dGithub.trim() !== (view.githubUrl ?? '') ||
      dYears.trim() !== yearsToText(view.yearsExperience));

  function startEdit() {
    seedDraft(view);
    setEditing(true);
  }

  function cancelEdit() {
    seedDraft(view);
    setEditing(false);
  }

  function saveDetails() {
    if (!view) return;
    const name = dName.trim();
    if (!name) {
      setError('Enter a candidate name.');
      return;
    }
    const li = normalizeProfileUrl(dLinkedin);
    if (!li.ok) {
      setError('LinkedIn must be a valid http(s) URL.');
      return;
    }
    const gh = normalizeProfileUrl(dGithub);
    if (!gh.ok) {
      setError('GitHub must be a valid http(s) URL.');
      return;
    }
    const years = parseYearsInput(dYears);
    if (!years.ok) {
      setError(
        `Years of experience must be a whole number 0–${MAX_YEARS_EXPERIENCE}.`
      );
      return;
    }
    actions.editCandidate(
      view.id,
      name,
      dSource,
      dOwner,
      li.value,
      gh.value,
      years.value
    );
    setError('');
    setEditing(false);
  }

  // Read-only fields reflect the live candidate; only edit mode uses the draft.
  const nameVal = editing ? dName : (view?.name ?? '');
  const sourceVal = editing ? dSource : (view?.source ?? sources[0]?.id ?? 0);
  const ownerVal = editing ? dOwner : (view?.owner ?? users[0]?.id ?? 0);
  const linkedinVal = editing ? dLinkedin : (view?.linkedinUrl ?? '');
  const githubVal = editing ? dGithub : (view?.githubUrl ?? '');
  const yearsVal = editing ? dYears : yearsToText(view?.yearsExperience);
  // Seniority reflects the value being shown (draft while editing, else live).
  const seniority = seniorityFor(
    bands,
    editing ? parseYearsInput(dYears).value : (view?.yearsExperience ?? null)
  );

  return (
    <>
      <div className="details-form">
        <div className="section-title">Candidate details</div>
        <div className="field">
          <span className="label">Name</span>
          <input
            type="text"
            maxLength={120}
            value={nameVal}
            disabled={!editing}
            onChange={(e) => {
              setDName(e.target.value);
              setError('');
            }}
            placeholder="Full name"
          />
        </div>
        <div className="field-row">
          <div className="field">
            <span className="label">Source</span>
            <select
              value={sourceVal}
              disabled={!editing}
              onChange={(e) => setDSource(Number(e.target.value))}
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
              value={ownerVal}
              disabled={!editing}
              onChange={(e) => setDOwner(Number(e.target.value))}
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
              value={yearsVal}
              disabled={!editing}
              onChange={(e) => {
                setDYears(e.target.value);
                setError('');
              }}
              placeholder="Unspecified"
            />
            {seniority && <span className="exp-tag">{seniority}</span>}
          </div>
        </div>
        <div className="field">
          <span className="label">LinkedIn URL (optional)</span>
          <input
            type="url"
            maxLength={MAX_PROFILE_URL}
            value={linkedinVal}
            disabled={!editing}
            onChange={(e) => {
              setDLinkedin(e.target.value);
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
            value={githubVal}
            disabled={!editing}
            onChange={(e) => {
              setDGithub(e.target.value);
              setError('');
            }}
            placeholder={GITHUB_URL_PLACEHOLDER}
          />
        </div>
        {editing && error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          {editing ? (
            <>
              <button className="btn" onClick={cancelEdit}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!detailsDirty}
                onClick={saveDetails}
              >
                Save details
              </button>
            </>
          ) : (
            <button className="btn" disabled={!view} onClick={startEdit}>
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="field">
        <span className="label">Status</span>
        <div className="status-control">
          <span
            className={`status-dot st-${view?.status ?? 'active'}`}
            aria-hidden
          />
          <select
            value={view?.status ?? 'active'}
            onChange={(e) =>
              view && actions.setStatus(view.id, e.target.value as Status)
            }
          >
            {(Object.keys(STATUS) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
