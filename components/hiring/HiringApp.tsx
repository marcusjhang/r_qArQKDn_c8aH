'use client';

// App shell for the Hiring Pipeline Tracker: brand + job tabs, the toolbar
// (job title, terminal-state toggle, quick-add), the board, and the detail
// slide-over. Board-first: the board is the home screen and the drawer opens
// over it so pipeline context stays on screen.

import { useEffect, useState } from 'react';
import { isTerminal } from '@/lib/hiring/helpers';
import { useHiringStore } from '@/lib/hiring/store';
import type { HiringState } from '@/lib/hiring/types';
import Board from './Board';
import DetailDrawer from './DetailDrawer';
import AddCandidateModal from './AddCandidateModal';
import NewJobModal from './NewJobModal';
import JobTabs from './JobTabs';
import TopBar from './TopBar';
import './hiring.css';

export default function HiringApp({
  initial,
  userEmail,
  isAdmin = false
}: {
  initial: HiringState;
  userEmail?: string | null;
  isAdmin?: boolean;
}) {
  const { state, actions } = useHiringStore(initial);
  const [activeJob, setActiveJob] = useState<number>(state.jobs[0]?.id ?? 0);
  const [showRejected, setShowRejected] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [addingCandidate, setAddingCandidate] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);

  // Keep a valid active job — e.g. after deleting the active job, fall back.
  useEffect(() => {
    if (state.jobs.length && !state.jobs.some((j) => j.id === activeJob)) {
      setActiveJob(state.jobs[0].id);
    }
  }, [state.jobs, activeJob]);

  const job = state.jobs.find((j) => j.id === activeJob) ?? state.jobs[0];

  function liveCount(jobId: number) {
    return state.candidates.filter((c) => c.jobId === jobId && !isTerminal(c))
      .length;
  }

  function selectJob(jobId: number) {
    setActiveJob(jobId);
    setOpenId(null);
  }


  const jobCands = job
    ? state.candidates.filter((c) => c.jobId === job.id)
    : [];
  const live = job ? liveCount(job.id) : 0;
  const hiredCount = jobCands.filter((c) => c.status === 'hired').length;
  const rejectedCount = jobCands.filter((c) => c.status === 'rejected').length;
  const meta =
    `${live} active candidate${live === 1 ? '' : 's'}` +
    (hiredCount ? ` · ${hiredCount} hired` : '') +
    (rejectedCount && !showRejected
      ? ` · ${rejectedCount} rejected hidden`
      : '');

  return (
    <div className="ht-root">
      <TopBar
        subtitle="Pipeline Tracker"
        userEmail={userEmail}
        nav={isAdmin ? { href: '/settings', label: '⚙ Settings' } : undefined}
      >
        <button className="btn primary" onClick={() => setCreatingJob(true)}>
          ＋ New job
        </button>
        <JobTabs
          jobs={state.jobs}
          activeJob={activeJob}
          liveCount={liveCount}
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
        <div className="spacer" />
        <label className="toggle">
          <input
            type="checkbox"
            checked={showRejected}
            onChange={(e) => setShowRejected(e.target.checked)}
          />{' '}
          Show rejected
        </label>
        <button
          className="btn primary"
          onClick={() => setAddingCandidate(true)}
          disabled={!job}
        >
          ＋ Add candidate
        </button>
      </div>

      <Board
        state={state}
        actions={actions}
        activeJob={activeJob}
        showRejected={showRejected}
        onOpen={setOpenId}
      />

      <DetailDrawer
        state={state}
        actions={actions}
        openId={openId}
        onClose={() => setOpenId(null)}
      />

      {addingCandidate && job && (
        <AddCandidateModal
          jobTitle={job.title}
          onClose={() => setAddingCandidate(false)}
          onAdd={(name, source, owner) =>
            actions.addCandidate(job.id, name, source, owner)
          }
        />
      )}

      {creatingJob && (
        <NewJobModal
          onClose={() => setCreatingJob(false)}
          onCreate={(title) =>
            actions.createJob(title, (id) => setActiveJob(id))
          }
        />
      )}
    </div>
  );
}
