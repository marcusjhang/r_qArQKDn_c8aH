'use client';

// Job switcher. Shows a capped set of inline tabs — starred jobs first, then the
// oldest — and puts everything else in a dropdown that also lets you star/unstar
// (pin as a tab) and delete jobs. The active job is always kept visible.

import { useId, useRef, useState } from 'react';
import { partitionJobTabs, MAX_FAVORITES, type Job } from '@/lib/hiring';
import { Button } from '@/components/ui/button';
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
  const confirmBaseId = useId();
  // The ✕ that opened the confirm, so focus can return to it on Cancel — the
  // confirm's Cancel autoFocuses on open (moving focus into the dialog), and
  // this restores it, giving the `role="dialog"` the focus round-trip it implies.
  const confirmTriggerRef = useRef<HTMLButtonElement | null>(null);

  function closeConfirm() {
    setConfirmId(null);
    confirmTriggerRef.current?.focus();
    confirmTriggerRef.current = null;
  }

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
        <div
          key={j.id}
          className="jobtab"
          aria-current={j.id === activeJob ? 'true' : undefined}
        >
          <button
            type="button"
            className="jobtab-star"
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
            type="button"
            className="jobtab-select"
            onClick={() => onSelect(j.id)}
          >
            {j.title} <span className="count">{liveCount(j.id)}</span>
          </button>
        </div>
      ))}

      <div className="jobmenu-wrap">
        <Button
          variant="app"
          className="jobmenu-trigger"
          title="All jobs"
          {...menu.triggerProps}
        >
          {overflow.length ? `${overflow.length} more ` : 'Jobs '}▾
        </Button>
        {menu.open && (
          <div className="jobmenu" {...menu.menuProps}>
            {sorted.map((j) => (
              <div className="jobmenu-row" key={j.id}>
                <button
                  type="button"
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
                  onClick={() => {
                    // Acting on another row dismisses any open confirm popup.
                    setConfirmId(null);
                    onToggleStar(j.id, !j.starred);
                  }}
                >
                  {j.starred ? '★' : '☆'}
                </button>
                <button
                  type="button"
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
                <button
                  type="button"
                  className="jobmenu-del"
                  title={
                    jobs.length <= 1 ? 'Can’t delete the only job' : 'Delete job'
                  }
                  disabled={jobs.length <= 1}
                  aria-haspopup="dialog"
                  aria-expanded={confirmId === j.id}
                  aria-controls={
                    confirmId === j.id ? `${confirmBaseId}-${j.id}` : undefined
                  }
                  onClick={(e) => {
                    if (confirmId === j.id) {
                      closeConfirm();
                    } else {
                      confirmTriggerRef.current = e.currentTarget;
                      setConfirmId(j.id);
                    }
                  }}
                >
                  ✕
                </button>
                {confirmId === j.id && (
                  <div
                    className="jobmenu-confirm"
                    role="dialog"
                    id={`${confirmBaseId}-${j.id}`}
                    aria-label={`Delete ${j.title}?`}
                  >
                    <button
                      type="button"
                      className="jobmenu-del danger"
                      onClick={() => {
                        onDelete(j.id);
                        menu.close();
                        setConfirmId(null);
                        confirmTriggerRef.current = null;
                      }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      // autoFocus moves focus into the confirmation on open so a
                      // keyboard / screen-reader user lands on the safe (Cancel)
                      // choice and the dialog is announced.
                      autoFocus
                      className="jobmenu-cancel"
                      onClick={closeConfirm}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
