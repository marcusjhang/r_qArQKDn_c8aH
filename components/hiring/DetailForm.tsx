'use client';

// Candidate details in the drawer; read-only until Edit. Status is a separate always-live control; fields + validation shared with the add modal via <CandidateFields>/useCandidateDraft.

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import CandidateFields from './CandidateFields';
import { useCandidateDraft } from './hooks/useCandidateDraft';

// Status dot colour per status, matching the former `.status-dot.st-*` rules.
const STATUS_DOT_TONE: Record<Status, string> = {
  active: 'bg-primary',
  onhold: 'bg-hold',
  rejected: 'bg-rej',
  hired: 'bg-hired'
};

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

  // Re-seed on openId (not view.id): view falls back to the last-shown candidate during slide-out, so keying on its id would leave a reopened candidate stuck in edit mode.
  useEffect(() => {
    setEditing(false);
    reset(draftFromCandidate(view, sources, users));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Read-only fields mirror the live candidate; while editing the draft is authoritative and must not be clobbered.
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
      <div className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.03em] text-muted-foreground">
          Candidate details
        </div>
        <CandidateFields
          draft={draft}
          onField={setField}
          users={users}
          sources={sources}
          bands={bands}
          disabled={!editing}
          yearsPlaceholder="Unspecified"
        />
        {editing && <FormError message={error} />}
        <div className="flex justify-end gap-2">
          {editing ? (
            <>
              <Button variant="app" onClick={cancelEdit}>
                Cancel
              </Button>
              <Button
                variant="appPrimary"
                disabled={!dirty(view)}
                onClick={saveDetails}
              >
                Save details
              </Button>
            </>
          ) : (
            <Button variant="app" disabled={!view} onClick={startEdit}>
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground"
          htmlFor="detail-status"
        >
          Status
        </label>
        <div className="relative flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 flex-none rounded-full ${STATUS_DOT_TONE[view?.status ?? 'active']}`}
            aria-hidden
          />
          <select
            id="detail-status"
            className="min-w-0 flex-auto appearance-none rounded-md border border-border-strong bg-surface py-2 pl-2.5 pr-[34px] text-[13px] text-foreground focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary-weak focus:ring-offset-0"
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
          <ChevronDown
            size={16}
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </div>
    </>
  );
}
