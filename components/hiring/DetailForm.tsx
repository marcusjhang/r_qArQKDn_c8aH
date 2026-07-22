'use client';

// Candidate details in the drawer, laid out like the add-candidate form:
// Name, Source + Owner, and the optional LinkedIn / GitHub links. The section
// is read-only until Edit is pressed, then Save/Cancel; one editCandidate call
// persists all five fields. Status stays a separate, always-live control (it's
// a pipeline action, not part of the candidate's identity).

import { useEffect, useState } from 'react';
import {
  SOURCES,
  STATUS,
  MAX_PROFILE_URL,
  normalizeProfileUrl,
  displayName,
  type HiringActions,
  type Candidate,
  type Status,
  type User
} from '@/lib/hiring';

export default function DetailForm({
  view,
  actions,
  users,
  resetKey
}: {
  view: Candidate | null;
  actions: HiringActions;
  users: User[];
  /** Identity of the open candidate (openId) — the form resets when it changes. */
  resetKey: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [dName, setDName] = useState('');
  const [dSource, setDSource] = useState(SOURCES[0]);
  const [dOwner, setDOwner] = useState<number>(users[0]?.id ?? 0);
  const [dLinkedin, setDLinkedin] = useState('');
  const [dGithub, setDGithub] = useState('');
  const [error, setError] = useState('');

  function seedDraft(c: Candidate | null) {
    setDName(c?.name ?? '');
    setDSource(c?.source ?? SOURCES[0]);
    setDOwner(c?.owner ?? users[0]?.id ?? 0);
    setDLinkedin(c?.linkedinUrl ?? '');
    setDGithub(c?.githubUrl ?? '');
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
      dGithub.trim() !== (view.githubUrl ?? ''));

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
    actions.editCandidate(view.id, name, dSource, dOwner, li.value, gh.value);
    setError('');
    setEditing(false);
  }

  // Read-only fields reflect the live candidate; only edit mode uses the draft.
  const nameVal = editing ? dName : (view?.name ?? '');
  const sourceVal = editing ? dSource : (view?.source ?? SOURCES[0]);
  const ownerVal = editing ? dOwner : (view?.owner ?? users[0]?.id ?? 0);
  const linkedinVal = editing ? dLinkedin : (view?.linkedinUrl ?? '');
  const githubVal = editing ? dGithub : (view?.githubUrl ?? '');

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
              onChange={(e) => setDSource(e.target.value)}
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
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
            placeholder="https://www.linkedin.com/in/…"
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
            placeholder="https://github.com/…"
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
