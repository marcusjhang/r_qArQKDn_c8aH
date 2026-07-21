'use client';

// App shell for the Hiring Pipeline Tracker: brand + job tabs, the toolbar
// (job title, terminal-state toggle, quick-add), the board, and the detail
// slide-over. Board-first: the board is the home screen and the drawer opens
// over it so pipeline context stays on screen.

import { useState } from 'react';
import { SOURCES } from '@/lib/hiring/config';
import { isTerminal } from '@/lib/hiring/helpers';
import { useHiringStore } from '@/lib/hiring/store';
import type { HiringState } from '@/lib/hiring/types';
import Board from './Board';
import DetailDrawer from './DetailDrawer';
import './hiring.css';

export default function HiringApp({ initial }: { initial: HiringState }) {
  const { state, actions } = useHiringStore(initial);
  const [activeJob, setActiveJob] = useState<number>(state.jobs[0]?.id ?? 0);
  const [showTerminal, setShowTerminal] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const job = state.jobs.find((j) => j.id === activeJob) ?? state.jobs[0];

  function liveCount(jobId: number) {
    return state.candidates.filter((c) => c.job === jobId && !isTerminal(c))
      .length;
  }

  function selectJob(jobId: number) {
    setActiveJob(jobId);
    setOpenId(null);
  }

  function quickAddCandidate() {
    if (!job) return;
    const name = window.prompt('Candidate name:');
    if (!name || !name.trim()) return;
    const source =
      window.prompt(`Source (${SOURCES.join(', ')}):`, 'LinkedIn') || 'LinkedIn';
    actions.addCandidate(job.id, name.trim(), source.trim());
  }

  const live = job ? liveCount(job.id) : 0;
  const total = job
    ? state.candidates.filter((c) => c.job === job.id).length
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
        <button className="btn primary" onClick={quickAddCandidate}>
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
    </div>
  );
}
