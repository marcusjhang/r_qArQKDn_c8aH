'use client';

// Slide-over candidate detail; coordinates open/close + last-shown candidate, delegating rendering to DetailHeader/DetailForm/FeedbackList/AddFeedbackForm/DetailFooter/ChatPanel.

import { useEffect, useRef } from 'react';
import {
  candidateById,
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

  // Trap focus while open and restore to the trigger on close; `inert` (below) takes the closed drawer out of the tab order.
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

  // Moving a candidate's stage returns you to the board so the move is visible.
  function moveAndClose(dir: 1 | -1) {
    if (!view) return;
    actions.advance(view.id, dir);
    onClose();
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-20 bg-[rgba(16,24,40,0.32)] transition-opacity duration-[180ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        ref={trapRef}
        className={`fixed right-0 top-0 z-[21] flex h-full w-[440px] max-w-full flex-col bg-surface shadow-drawer transition-transform duration-[220ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none ${open ? 'translate-x-0' : 'translate-x-full'}`}
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

        <div className="flex flex-col gap-6 overflow-y-auto p-4">
          <DetailForm
            view={view}
            actions={actions}
            users={state.users}
            sources={state.sources}
            bands={state.bands}
            resetKey={openId}
          />

          <div className="flex flex-col gap-3">
            <FeedbackList view={view} job={job} users={state.users} />
            <AddFeedbackForm
              resetKey={openId}
              currentUserId={currentUserId}
              feedback={view?.feedback ?? []}
              job={job}
              onSave={(entry) =>
                view &&
                currentUserId != null &&
                // byUser feeds the optimistic display row only; the server derives the real author from the session.
                actions.saveFeedback(view.id, { byUser: currentUserId, ...entry })
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
