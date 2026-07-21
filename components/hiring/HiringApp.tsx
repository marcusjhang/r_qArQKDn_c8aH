'use client';

// App shell for the Hiring Pipeline Tracker: brand + job tabs, the toolbar
// (job title, terminal-state toggle, quick-add), the board, and the detail
// slide-over. Board-first: the board is the home screen and the drawer opens
// over it so pipeline context stays on screen.

import { useState } from 'react';
import Link from 'next/link';
import { isTerminal } from '@/lib/hiring/helpers';
import { useHiringStore } from '@/lib/hiring/store';
import type { HiringState } from '@/lib/hiring/types';
import Board from './Board';
import DetailDrawer from './DetailDrawer';
import AddCandidateModal from './AddCandidateModal';
import UserMenu from './UserMenu';
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
  const [showTerminal, setShowTerminal] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [addingCandidate, setAddingCandidate] = useState(false);

  const job = state.jobs.find((j) => j.id === activeJob) ?? state.jobs[0];

  function liveCount(jobId: number) {
    return state.candidates.filter((c) => c.jobId === jobId && !isTerminal(c))
      .length;
  }

  function selectJob(jobId: number) {
    setActiveJob(jobId);
    setOpenId(null);
  }


  const live = job ? liveCount(job.id) : 0;
  const total = job
    ? state.candidates.filter((c) => c.jobId === job.id).length
    : 0;
  const hidden = total - live;
  const meta =
    `${live} active candidate${live === 1 ? '' : 's'}` +
    (hidden && !showTerminal ? ` · ${hidden} hidden (hired/rejected)` : '');

  return (
    <div className="ht-root">
      <header className="topbar">
        <div className="brand">
          <span className="logo" /> Lightsprint Hiring{' '}
          <small>Pipeline Tracker</small>
        </div>
        <div className="spacer" />
        <nav className="jobtabs" aria-label="Jobs">
          {state.jobs.map((j) => (
            <button
              key={j.id}
              className="jobtab"
              aria-selected={j.id === activeJob}
              onClick={() => selectJob(j.id)}
            >
              {j.title} <span className="count">{liveCount(j.id)}</span>
            </button>
          ))}
        </nav>
        <Link className="btn" href="/settings">
          ⚙ Settings
        </Link>
        <UserMenu email={userEmail} />
      </header>

      <div className="toolbar">
        <div>
          <h1 className="jobtitle">{job?.title ?? '—'}</h1>
          <div className="jobmeta">{meta}</div>
        </div>
        <div className="spacer" />
        <label className="toggle">
          <input
            type="checkbox"
            checked={showTerminal}
            onChange={(e) => setShowTerminal(e.target.checked)}
          />{' '}
          Show hired &amp; rejected
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
        showTerminal={showTerminal}
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
    </div>
  );
}
