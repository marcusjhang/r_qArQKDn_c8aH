'use client';

// Job switcher. Shows a capped set of inline tabs — starred jobs first, then the
// oldest — and puts everything else in a dropdown that also lets you star/unstar
// (pin as a tab) and delete jobs. The active job is always kept visible.

import { useEffect, useRef, useState } from 'react';
import { MAX_FAVORITES } from '@/lib/hiring/helpers';
import type { Job } from '@/lib/hiring/types';

const INLINE_CAP = 3;

export default function JobTabs({
  jobs,
  activeJob,
  liveCount,
  canWrite,
  onSelect,
  onToggleStar,
  onDelete
}: {
  jobs: Job[];
  activeJob: number;
  liveCount: (jobId: number) => number;
  // RBAC: readers can switch jobs but not star or delete them.
  canWrite: boolean;
  onSelect: (jobId: number) => void;
  onToggleStar: (jobId: number, starred: boolean) => void;
  onDelete: (jobId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close() {
      setOpen(false);
      setConfirmId(null);
    }
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Starred first (stable — jobs already come oldest-first), cap the inline set,
  // then guarantee the active job is shown even if it would otherwise overflow.
  const sorted = [...jobs].sort(
    (a, b) => Number(b.starred) - Number(a.starred)
  );
  let inline = sorted.slice(0, INLINE_CAP);
  if (!inline.some((j) => j.id === activeJob)) {
    const active = jobs.find((j) => j.id === activeJob);
    if (active) inline = [...inline, active];
  }
  const inlineIds = new Set(inline.map((j) => j.id));
  const overflow = sorted.filter((j) => !inlineIds.has(j.id));
  const favCount = jobs.filter((j) => j.starred).length;

  return (
    <div className="jobtabs" ref={ref}>
      {inline.map((j) => (
        <button
          key={j.id}
          className="jobtab"
          aria-selected={j.id === activeJob}
          onClick={() => onSelect(j.id)}
        >
          {j.starred && (
            <span className="tab-star" aria-hidden>
              ★
            </span>
          )}
          {j.title} <span className="count">{liveCount(j.id)}</span>
        </button>
      ))}

      <div className="jobmenu-wrap">
        <button
          className="btn jobmenu-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          title="All jobs"
          onClick={() => setOpen((o) => !o)}
        >
          {overflow.length ? `${overflow.length} more ` : 'Jobs '}▾
        </button>
        {open && (
          <div className="jobmenu" role="menu">
            {sorted.map((j) => (
              <div className="jobmenu-row" key={j.id}>
                {canWrite && (
                  <button
                    className="jobmenu-star"
                    aria-pressed={j.starred}
                    disabled={!j.starred && favCount >= MAX_FAVORITES}
                    title={
                      j.starred
                        ? 'Unfavorite'
                        : favCount >= MAX_FAVORITES
                          ? `You can favorite up to ${MAX_FAVORITES} jobs`
                          : 'Favorite (pin as a tab)'
                    }
                    onClick={() => onToggleStar(j.id, !j.starred)}
                  >
                    {j.starred ? '★' : '☆'}
                  </button>
                )}
                <button
                  className={`jobmenu-select${j.id === activeJob ? ' active' : ''}`}
                  onClick={() => {
                    onSelect(j.id);
                    setOpen(false);
                    setConfirmId(null);
                  }}
                >
                  <span className="jobmenu-title">{j.title}</span>
                  <span className="count">{liveCount(j.id)}</span>
                </button>
                {!canWrite ? null : confirmId === j.id ? (
                  <span className="jobmenu-confirm">
                    <button
                      className="jobmenu-del danger"
                      onClick={() => {
                        onDelete(j.id);
                        setOpen(false);
                        setConfirmId(null);
                      }}
                    >
                      Delete
                    </button>
                    <button
                      className="jobmenu-cancel"
                      onClick={() => setConfirmId(null)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    className="jobmenu-del"
                    title={
                      jobs.length <= 1
                        ? 'Can’t delete the only job'
                        : 'Delete job'
                    }
                    disabled={jobs.length <= 1}
                    onClick={() => setConfirmId(j.id)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
