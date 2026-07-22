'use client';

// Slide-over candidate detail (Decisions 4, 5 & 7): owner/status/source
// controls, per-interviewer feedback list + add-feedback form with the
// 4-point rating picker, and Advance/Back stage controls. The board stays
// visible behind the drawer so pipeline context is never lost.
//
// This file coordinates open/close + the last-shown candidate; the rendering
// is delegated to DetailHeader, DetailForm, FeedbackList, AddFeedbackForm and
// DetailFooter.

import { useEffect, useRef } from 'react';
import type { HiringActions, Candidate, HiringState } from '@/lib/hiring';
import DetailHeader from './DetailHeader';
import DetailForm from './DetailForm';
import FeedbackList from './FeedbackList';
import AddFeedbackForm from './AddFeedbackForm';
import DetailFooter from './DetailFooter';

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
          onToggleStar={actions.setCandidateStarred}
          onClose={onClose}
        />

        <div className="drawer-body">
          <DetailForm view={view} actions={actions} resetKey={openId} />

          <div className="feedback">
            <FeedbackList view={view} />
            <AddFeedbackForm
              resetKey={openId}
              onAdd={(entry) => view && actions.addFeedback(view.id, entry)}
            />
          </div>
        </div>

        <DetailFooter view={view} job={job} onMove={moveAndClose} />
      </aside>
    </>
  );
}
