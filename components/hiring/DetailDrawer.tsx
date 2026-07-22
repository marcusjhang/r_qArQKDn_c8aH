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
import type { HiringActions, Candidate, HiringState } from '@/lib/hiring';
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
  onClose,
  focusMessageId
}: {
  state: HiringState;
  actions: HiringActions;
  openId: number | null;
  currentUserId: number | null;
  onClose: () => void;
  focusMessageId?: number | null;
}) {
  const candidate =
    openId == null
      ? null
      : (state.candidates.find((c) => c.id === openId) ?? null);

  // Keep the last shown candidate so content stays put during the slide-out.
  const lastRef = useRef<Candidate | null>(null);
  if (candidate) lastRef.current = candidate;
  const view = candidate ?? lastRef.current;
  const open = candidate != null;

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const job = view ? state.jobs.find((j) => j.id === view.jobId) : undefined;

  // Feedback is always authored by the signed-in user (one entry per user,
  // enforced by a DB unique constraint), so they can only add feedback if they
  // haven't reviewed this candidate yet.
  const reviewedIds = new Set((view?.feedback ?? []).map((f) => f.byUser));
  const canReview = currentUserId != null && !reviewedIds.has(currentUserId);

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
        className={`drawer${open ? ' open' : ''}`}
        aria-hidden={!open}
        role="dialog"
        aria-modal="true"
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

        <DetailFooter view={view} job={job} onMove={moveAndClose} />
      </aside>
    </>
  );
}
