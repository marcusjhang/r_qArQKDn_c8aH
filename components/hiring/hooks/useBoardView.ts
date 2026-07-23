'use client';

// The board shell's view state, extracted from HiringApp so the component stays
// presentational. Owns the three pieces of transient, non-persisted board state
// — the active job, the terminal-cards toggle, and which single overlay is open
// — and the one rule that ties the first to the domain data (fall back to
// another job when the active one is deleted).
//
// The overlay itself is the pure discriminated-union state machine in
// lib/hiring/overlay.ts (overlayReducer); this hook is the imperative shell that
// pairs it with the active-job/showRejected state and exposes memoized actions,
// mirroring useHiringStore's `{ state, actions }` shape for the domain data.

import { useEffect, useMemo, useReducer, useState } from 'react';
import {
  NO_OVERLAY,
  overlayReducer,
  type Job,
  type Overlay
} from '@/lib/hiring';

export interface BoardViewActions {
  /** Switch the active job, closing any overlay left over from the old one. */
  selectJob: (jobId: number) => void;
  setShowRejected: (value: boolean) => void;
  openNewJob: () => void;
  openAddCandidate: () => void;
  /** Open a candidate's detail from the board — no message to focus. */
  openFromBoard: (candidateId: number) => void;
  /** Open a candidate's detail from a notification: switch to their job (when
   *  it still exists) and remember the message to scroll to. */
  openFromNotification: (
    candidateId: number,
    jobId: number,
    messageId: number
  ) => void;
  /** Open a candidate picked from global search: switch to their job (when it
   *  still exists) and open the detail drawer with no message to focus. */
  openInJob: (candidateId: number, jobId: number) => void;
  close: () => void;
}

export function useBoardView(jobs: Job[]): {
  activeJob: number;
  showRejected: boolean;
  overlay: Overlay;
  actions: BoardViewActions;
} {
  const [activeJob, setActiveJob] = useState<number>(jobs[0]?.id ?? 0);
  const [showRejected, setShowRejected] = useState(false);
  const [overlay, dispatch] = useReducer(overlayReducer, NO_OVERLAY);

  // Keep a valid active job — e.g. after deleting the active job, fall back.
  useEffect(() => {
    if (jobs.length && !jobs.some((j) => j.id === activeJob)) {
      setActiveJob(jobs[0].id);
    }
  }, [jobs, activeJob]);

  const actions = useMemo<BoardViewActions>(
    () => ({
      selectJob: (jobId) => {
        setActiveJob(jobId);
        dispatch({ type: 'close' });
      },
      setShowRejected,
      openNewJob: () => dispatch({ type: 'openNewJob' }),
      openAddCandidate: () => dispatch({ type: 'openAddCandidate' }),
      openFromBoard: (candidateId) =>
        dispatch({ type: 'openCandidate', candidateId }),
      openFromNotification: (candidateId, jobId, messageId) => {
        if (jobs.some((j) => j.id === jobId)) setActiveJob(jobId);
        dispatch({
          type: 'openCandidate',
          candidateId,
          focusMessageId: messageId
        });
      },
      openInJob: (candidateId, jobId) => {
        if (jobs.some((j) => j.id === jobId)) setActiveJob(jobId);
        dispatch({ type: 'openCandidate', candidateId });
      },
      close: () => dispatch({ type: 'close' })
    }),
    [jobs]
  );

  return { activeJob, showRejected, overlay, actions };
}
