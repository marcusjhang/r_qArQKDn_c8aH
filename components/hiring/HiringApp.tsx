'use client';

// App shell for the Hiring Pipeline Tracker: brand + job tabs, the toolbar
// (job title, terminal-state toggle, quick-add), the board, and the detail
// slide-over. Board-first: the board is the home screen and the drawer opens
// over it so pipeline context stays on screen.

import { useEffect, useState } from 'react';
import {
  formatJobMeta,
  jobStats,
  liveCount,
  useHiringStore,
  type HiringState
} from '@/lib/hiring';
import Board from './Board';
import DetailDrawer from './DetailDrawer';
import AddCandidateModal from './AddCandidateModal';
import NewJobModal from './NewJobModal';
import JobTabs from './JobTabs';
import TopBar from './TopBar';
import './hiring.css';

export default function HiringApp({
  initial,
  userEmail
}: {
  initial: HiringState;
  userEmail?: string | null;
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

  // Thin adapter so JobTabs keeps its (jobId) => number prop contract.
  const jobLiveCount = (jobId: number) => liveCount(state.candidates, jobId);

  function selectJob(jobId: number) {
    setActiveJob(jobId);
    setOpenId(null);
  }

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
        nav={{ href: '/settings', label: '⚙ Settings' }}
      >
        <button className="btn primary" onClick={() => setCreatingJob(true)}>
          ＋ New job
        </button>
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
          users={state.users}
          onClose={() => setAddingCandidate(false)}
          onAdd={(name, source, owner, linkedinUrl, githubUrl) =>
            actions.addCandidate(
              job.id,
              name,
              source,
              owner,
              linkedinUrl,
              githubUrl
            )
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
