'use client';

// The board shell's transient view state (active job, terminal-cards toggle, open overlay). The overlay is the pure state machine in lib/hiring/overlay.ts; this hook is its imperative shell.

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
  /** Open the CSV import dialog. */
  openImport: () => void;
  /** Open a candidate's detail from the board — no message to focus. */
  openFromBoard: (candidateId: number) => void;
  /** Open a candidate's detail from a notification, remembering the message to scroll to. */
  openFromNotification: (
    candidateId: number,
    jobId: number,
    messageId: number
  ) => void;
  /** Open a candidate picked from global search, switching to their job. */
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
      openImport: () => dispatch({ type: 'openImport' }),
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
