'use client';

// Job switcher. Shows a capped set of inline tabs — starred jobs first, then the
// oldest — and puts everything else in a dropdown that also lets you star/unstar
// (pin as a tab) and delete jobs. The active job is always kept visible.

import { useState } from 'react';
import { partitionJobTabs, MAX_FAVORITES, type Job } from '@/lib/hiring';
import { useDismissableMenu } from './hooks/useDismissableMenu';

const INLINE_CAP = 3;

export default function JobTabs({
  jobs,
  activeJob,
  liveCount,
  onSelect,
  onToggleStar,
  onDelete
}: {
  jobs: Job[];
  activeJob: number;
  liveCount: (jobId: number) => number;
  onSelect: (jobId: number) => void;
  onToggleStar: (jobId: number, starred: boolean) => void;
  onDelete: (jobId: number) => void;
}) {
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const menu = useDismissableMenu({ onDismiss: () => setConfirmId(null) });

  // Starred first (stable — jobs already come oldest-first), cap the inline set,
  // then guarantee the active job is shown even if it would otherwise overflow.
  const { sorted, inline, overflow, favCount } = partitionJobTabs(
    jobs,
    activeJob,
    INLINE_CAP
  );

  return (
    <div className="jobtabs" ref={menu.wrapRef}>
      {inline.map((j) => (
        <button
          key={j.id}
          className="jobtab"
          aria-current={j.id === activeJob ? 'true' : undefined}
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
          title="All jobs"
          {...menu.triggerProps}
        >
          {overflow.length ? `${overflow.length} more ` : 'Jobs '}▾
        </button>
        {menu.open && (
          <div className="jobmenu" {...menu.menuProps}>
            {sorted.map((j) => (
              <div className="jobmenu-row" key={j.id}>
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
                <button
                  className={`jobmenu-select${j.id === activeJob ? ' active' : ''}`}
                  onClick={() => {
                    onSelect(j.id);
                    menu.close();
                    setConfirmId(null);
                  }}
                >
                  <span className="jobmenu-title">{j.title}</span>
                  <span className="count">{liveCount(j.id)}</span>
                </button>
                {confirmId === j.id ? (
                  <span className="jobmenu-confirm">
                    <button
                      className="jobmenu-del danger"
                      onClick={() => {
                        onDelete(j.id);
                        menu.close();
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
