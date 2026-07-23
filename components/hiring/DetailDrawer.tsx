'use client';

// Slide-over candidate detail (Decisions 4, 5 & 7): owner/status/source
// controls, per-interviewer feedback list + add-feedback form with the
// 4-point rating picker, and Advance/Back stage controls. The board stays
// visible behind the drawer so pipeline context is never lost.
//
// This file coordinates open/close + the last-shown candidate; the rendering
// is delegated to DetailHeader, DetailForm, FeedbackList, AddFeedbackForm,
// DetailFooter and the per-applicant discussion ChatPanel.

import { useEffect, useRef } from 'react';
import {
  candidateById,
  canReviewCandidate,
  jobById,
  type HiringActions,
  type Candidate,
  type HiringState
} from '@/lib/hiring';
import { useFocusTrap } from './hooks/useFocusTrap';
import DetailHeader from './DetailHeader';
import DetailForm from './DetailForm';
import FeedbackList from './FeedbackList';
import AddFeedbackForm from './AddFeedbackForm';
import DetailFooter from './DetailFooter';
import ChatPanel from './ChatPanel';

export default function DetailDrawer({
  state,
  actions,
  openId,
  currentUserId,
  now,
  onClose,
  focusMessageId
}: {
  state: HiringState;
  actions: HiringActions;
  openId: number | null;
  currentUserId: number | null;
  /** Shared clock for time-in-stage UI; null until mounted (see useNow). */
  now: number | null;
  onClose: () => void;
  focusMessageId?: number | null;
}) {
  const candidate = candidateById(state.candidates, openId);

  // Keep the last shown candidate so content stays put during the slide-out.
  const lastRef = useRef<Candidate | null>(null);
  if (candidate) lastRef.current = candidate;
  const view = candidate ?? lastRef.current;
  const open = candidate != null;

  // Trap focus inside the drawer while open and restore it to the trigger on
  // close; `inert` (below) takes the closed drawer out of the tab order so its
  // controls can't be reached behind the board.
  const trapRef = useFocusTrap<HTMLElement>(open);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const job = jobById(state.jobs, view?.jobId ?? null);

  // Whether the signed-in user may leave feedback (one entry per interviewer,
  // authored server-side from the session). The rule lives in the helper.
  const canReview = canReviewCandidate(view, currentUserId);

  // Moving a candidate's stage returns you to the board so the move is visible.
  function moveAndClose(dir: 1 | -1) {
    if (!view) return;
    actions.advance(view.id, dir);
    onClose();
  }

  return (
    <>
      <div
        className={`scrim${open ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        ref={trapRef}
        className={`drawer${open ? ' open' : ''}`}
        inert={!open}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <DetailHeader
          view={view}
          job={job}
          sources={state.sources}
          onToggleStar={actions.setCandidateStarred}
          onClose={onClose}
        />

        <div className="drawer-body">
          <DetailForm
            view={view}
            actions={actions}
            users={state.users}
            sources={state.sources}
            bands={state.bands}
            resetKey={openId}
          />

          <div className="feedback">
            <FeedbackList view={view} users={state.users} />
            <AddFeedbackForm
              resetKey={openId}
              canReview={canReview}
              onAdd={(entry) =>
                view &&
                currentUserId != null &&
                // byUser feeds the optimistic display row only; the server
                // derives the real author from the session.
                actions.addFeedback(view.id, { byUser: currentUserId, ...entry })
              }
            />
          </div>

          <ChatPanel
            candidateId={candidate ? candidate.id : null}
            currentUserId={currentUserId}
            users={state.users}
            focusMessageId={focusMessageId ?? null}
          />
        </div>

        <DetailFooter
          view={view}
          job={job}
          stageWarnDays={state.stageWarnDays}
          now={now}
          onMove={moveAndClose}
        />
      </aside>
    </>
  );
}
