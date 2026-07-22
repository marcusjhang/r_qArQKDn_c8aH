'use client';

// App shell for the Hiring Pipeline Tracker: brand + job tabs, the toolbar
// (job title, terminal-state toggle, quick-add), the board, and the detail
// slide-over. Board-first: the board is the home screen and the drawer opens
// over it so pipeline context stays on screen.

import { useCallback, useEffect, useReducer, useState } from 'react';
import {
  findUserIdByEmail,
  formatJobMeta,
  jobById,
  jobStats,
  liveCount,
  overlayReducer,
  useHiringStore,
  NO_OVERLAY,
  type HiringState,
  type Notification
} from '@/lib/hiring';
import { Button } from '@/components/ui/button';
import Board from './Board';
import DetailDrawer from './DetailDrawer';
import AddCandidateModal from './AddCandidateModal';
import NewJobModal from './NewJobModal';
import JobTabs from './JobTabs';
import TopBar from './TopBar';
import { ACCOUNT_LINKS } from './UserMenu';
import NotificationBell from './NotificationBell';
import CandidateSearch from './CandidateSearch';
import './hiring.css';

export default function HiringApp({
  initial,
  userEmail,
  notifications = []
}: {
  initial: HiringState;
  userEmail?: string | null;
  notifications?: Notification[];
}) {
  const { state, actions } = useHiringStore(initial);
  const [activeJob, setActiveJob] = useState<number>(state.jobs[0]?.id ?? 0);
  const [showRejected, setShowRejected] = useState(false);
  // A single overlay state machine replaces the old cluster of open/adding/
  // creating flags: at most one overlay is open at a time, so the drawer and
  // the two modals are variants of one discriminated union (see ./overlay).
  // Each open/close is one dispatch, and the per-overlay render props below are
  // derived from the union rather than kept in sync across separate setStates.
  const [overlay, dispatchOverlay] = useReducer(overlayReducer, NO_OVERLAY);
  const openId = overlay.kind === 'detail' ? overlay.candidateId : null;
  const focusMessageId =
    overlay.kind === 'detail' ? overlay.focusMessageId : null;
  const addingCandidate = overlay.kind === 'addCandidate';
  const creatingJob = overlay.kind === 'newJob';

  // Keep a valid active job — e.g. after deleting the active job, fall back.
  useEffect(() => {
    if (state.jobs.length && !state.jobs.some((j) => j.id === activeJob)) {
      setActiveJob(state.jobs[0].id);
    }
  }, [state.jobs, activeJob]);

  const job = jobById(state.jobs, activeJob) ?? state.jobs[0];

  // The logged-in user's id (matched by email) — used to default the feedback
  // author to whoever is actually leaving the review.
  const currentUserId = findUserIdByEmail(state.users, userEmail);

  // Thin adapter so JobTabs keeps its (jobId) => number prop contract.
  const jobLiveCount = (jobId: number) => liveCount(state.candidates, jobId);

  function selectJob(jobId: number) {
    setActiveJob(jobId);
    dispatchOverlay({ type: 'close' });
  }

  // Open a candidate from the board — no specific message to focus.
  const openFromBoard = useCallback((candidateId: number) => {
    dispatchOverlay({ type: 'openCandidate', candidateId });
  }, []);

  // Jump to an applicant's chat from a notification: switch to their job (so
  // the board context is right), open their detail drawer, and remember which
  // message to scroll to once the thread loads.
  const openCandidate = useCallback(
    (candidateId: number, jobId: number, messageId: number) => {
      if (state.jobs.some((j) => j.id === jobId)) setActiveJob(jobId);
      dispatchOverlay({
        type: 'openCandidate',
        candidateId,
        focusMessageId: messageId
      });
    },
    [state.jobs]
  );

  // Jump to a candidate picked from the global search: switch to their job (so
  // the board behind the drawer is the right one) and open their detail drawer.
  const openCandidateInJob = useCallback(
    (candidateId: number, jobId: number) => {
      if (state.jobs.some((j) => j.id === jobId)) setActiveJob(jobId);
      dispatchOverlay({ type: 'openCandidate', candidateId });
    },
    [state.jobs]
  );

  const meta = formatJobMeta(
    job
      ? jobStats(state.candidates, job.id)
      : { live: 0, hired: 0, rejected: 0 },
    showRejected
  );

  return (
    <div className="ht-root">
      <TopBar
        subtitle="Pipeline Tracker"
        userEmail={userEmail}
        navItems={[ACCOUNT_LINKS.settings, ACCOUNT_LINKS.members]}
        topRight={
          <NotificationBell
            notifications={notifications}
            onOpen={openCandidate}
          />
        }
      >
        <Button
          variant="appPrimary"
          onClick={() => dispatchOverlay({ type: 'openNewJob' })}
        >
          ＋ New job
        </Button>
        <JobTabs
          jobs={state.jobs}
          activeJob={activeJob}
          liveCount={jobLiveCount}
          onSelect={selectJob}
          onToggleStar={actions.setJobStarred}
          onDelete={actions.deleteJob}
        />
      </TopBar>

      <div className="toolbar">
        <div>
          <h1 className="jobtitle">{job?.title ?? '—'}</h1>
          <div className="jobmeta">{meta}</div>
        </div>
        <CandidateSearch
          candidates={state.candidates}
          jobs={state.jobs}
          users={state.users}
          sources={state.sources}
          bands={state.bands}
          onSelect={openCandidateInJob}
        />
        <div className="spacer" />
        <label className="toggle">
          <input
            type="checkbox"
            checked={showRejected}
            onChange={(e) => setShowRejected(e.target.checked)}
          />{' '}
          Show rejected
        </label>
        <Button
          variant="appPrimary"
          onClick={() => dispatchOverlay({ type: 'openAddCandidate' })}
          disabled={!job}
        >
          ＋ Add candidate
        </Button>
      </div>

      <Board
        state={state}
        actions={actions}
        activeJob={activeJob}
        showRejected={showRejected}
        onOpen={openFromBoard}
      />

      <DetailDrawer
        state={state}
        actions={actions}
        openId={openId}
        currentUserId={currentUserId}
        onClose={() => dispatchOverlay({ type: 'close' })}
        focusMessageId={focusMessageId}
      />

      {addingCandidate && job && (
        <AddCandidateModal
          jobTitle={job.title}
          users={state.users}
          sources={state.sources}
          bands={state.bands}
          onClose={() => dispatchOverlay({ type: 'close' })}
          onAdd={(name, source, owner, linkedinUrl, githubUrl, yearsExperience) =>
            actions.addCandidate(
              job.id,
              name,
              source,
              owner,
              linkedinUrl,
              githubUrl,
              yearsExperience
            )
          }
        />
      )}

      {creatingJob && (
        <NewJobModal
          onClose={() => dispatchOverlay({ type: 'close' })}
          onCreate={(title) =>
            actions.createJob(title, (id) => setActiveJob(id))
          }
        />
      )}
    </div>
  );
}
