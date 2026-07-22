'use client';

// Slide-over candidate detail (Decisions 4, 5 & 7): owner/status/source
// controls, per-interviewer feedback list + add-feedback form with the
// 4-point rating picker, and Advance/Back stage controls. The board stays
// visible behind the drawer so pipeline context is never lost. The fields,
// feedback list and add-feedback form live in their own components; the draft
// and Escape-to-close orchestration live in hooks.

import { useRef } from 'react';
import {
  stageNavigation,
  type Candidate,
  type HiringActions,
  type HiringState
} from '@/lib/hiring';
import { useEscapeKey } from '@/lib/hiring/hooks';
import CandidateFields from './CandidateFields';
import FeedbackList from './FeedbackList';
import AddFeedbackForm from './AddFeedbackForm';

export default function DetailDrawer({
  state,
  actions,
  openId,
  onClose
}: {
  state: HiringState;
  actions: HiringActions;
  openId: number | null;
  onClose: () => void;
}) {
  const candidate =
    openId == null
      ? null
      : state.candidates.find((c) => c.id === openId) ?? null;

  // Keep the last shown candidate so content stays put during the slide-out.
  const lastRef = useRef<Candidate | null>(null);
  if (candidate) lastRef.current = candidate;
  const view = candidate ?? lastRef.current;
  const isOpen = candidate != null;

  useEscapeKey(isOpen, onClose);

  const job = view ? state.jobs.find((j) => j.id === view.jobId) : undefined;

  // Stage position drives which footer actions exist (no dead-end buttons).
  const { canMoveBack, canAdvance } = stageNavigation(job, view);

  // Moving a candidate's stage returns you to the board so the move is visible.
  function moveAndClose(dir: 1 | -1) {
    if (!view) return;
    actions.advance(view.id, dir);
    onClose();
  }

  return (
    <>
      <div
        className={`scrim${isOpen ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />
      <aside
        className={`drawer${isOpen ? ' open' : ''}`}
        aria-hidden={!isOpen}
        role="dialog"
        aria-modal="true"
      >
        <div className="drawer-head">
          <button
            className="drawer-star"
            aria-pressed={view?.starred ?? false}
            title={view?.starred ? 'Unstar candidate' : 'Star candidate'}
            onClick={() =>
              view && actions.setCandidateStarred(view.id, !view.starred)
            }
          >
            {view?.starred ? '★' : '☆'}
          </button>
          <div className="who">
            <h2>{view?.name ?? '—'}</h2>
            <div className="sub">
              {view && job ? `${job.title} · ${view.source}` : ''}
            </div>
          </div>
          <button className="close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="drawer-body">
          <CandidateFields candidate={view} actions={actions} />

          <div className="feedback">
            <FeedbackList candidate={view} />
            <AddFeedbackForm
              openId={openId}
              onSubmit={(entry) => view && actions.addFeedback(view.id, entry)}
            />
          </div>
        </div>

        <div className="drawer-foot">
          <div className="stage-now">
            Stage: <b>{view?.stage ?? '—'}</b>
          </div>
          {canMoveBack && (
            <button className="btn" onClick={() => moveAndClose(-1)}>
              ← Move back
            </button>
          )}
          {canAdvance && (
            <button className="btn primary" onClick={() => moveAndClose(1)}>
              Advance stage →
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
