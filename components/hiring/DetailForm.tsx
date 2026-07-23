'use client';

// Candidate details in the drawer, laid out like the add-candidate form:
// Name, Source + Owner, years of experience, and the optional LinkedIn / GitHub
// links. The section is read-only until Edit is pressed, then Save/Cancel; one
// editCandidate call persists all fields. Status stays a separate, always-live
// control (it's a pipeline action, not part of the candidate's identity).
//
// The fields + validation are shared with the add-candidate modal via
// <CandidateFields> and useCandidateDraft, so the two forms can't drift.

import { useEffect, useState } from 'react';
import {
  STATUS,
  draftFromCandidate,
  type HiringActions,
  type Candidate,
  type Status,
  type User,
  type Source,
  type SeniorityBand
} from '@/lib/hiring';
import CandidateFields from './CandidateFields';
import { useCandidateDraft } from './hooks/useCandidateDraft';

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
  const { draft, setField, error, reset, validate, dirty } = useCandidateDraft(
    draftFromCandidate(view, sources, users)
  );

  // Leave edit mode and re-seed the draft whenever the drawer opens a different
  // candidate (or closes). Keyed on openId — which flips on open/close/switch —
  // rather than view?.id: view falls back to the last-shown candidate during
  // the slide-out, so keying on its id would leave a reopened candidate stuck
  // in edit mode; and an optimistic update to the open candidate must NOT reset
  // an in-progress edit.
  useEffect(() => {
    setEditing(false);
    reset(draftFromCandidate(view, sources, users));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // In read-only mode the fields mirror the live candidate, so an optimistic
  // update to the open candidate shows through immediately; while editing the
  // draft is authoritative and must not be clobbered.
  useEffect(() => {
    if (!editing) reset(draftFromCandidate(view, sources, users));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, editing]);

  function startEdit() {
    reset(draftFromCandidate(view, sources, users));
    setEditing(true);
  }

  function cancelEdit() {
    reset(draftFromCandidate(view, sources, users));
    setEditing(false);
  }

  function saveDetails() {
    if (!view) return;
    const values = validate();
    if (!values) return;
    actions.editCandidate(
      view.id,
      values.name,
      values.source,
      values.owner,
      values.linkedinUrl,
      values.githubUrl,
      values.yearsExperience
    );
    setEditing(false);
  }

  return (
    <>
      <div className="details-form">
        <div className="section-title">Candidate details</div>
        <CandidateFields
          draft={draft}
          onField={setField}
          users={users}
          sources={sources}
          bands={bands}
          disabled={!editing}
          yearsPlaceholder="Unspecified"
        />
        {editing && error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          {editing ? (
            <>
              <button className="btn" onClick={cancelEdit}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!dirty(view)}
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
        <label className="label" htmlFor="detail-status">
          Status
        </label>
        <div className="status-control">
          <span
            className={`status-dot st-${view?.status ?? 'active'}`}
            aria-hidden
          />
          <select
            id="detail-status"
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
