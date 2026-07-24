'use client';

// Job switcher: a capped set of inline tabs (starred first) plus a dropdown for the rest; the active job is always kept visible.

import { useId, useRef, useState } from 'react';
import { partitionJobTabs, MAX_FAVORITES, type Job } from '@/lib/hiring';
import { Button } from '@/components/ui/button';
import { Star, ChevronDown, X } from 'lucide-react';
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
  // The ✕ that opened the confirm, so focus returns to it on Cancel.
  const confirmTriggerRef = useRef<HTMLButtonElement | null>(null);

  function closeConfirm() {
    setConfirmId(null);
    confirmTriggerRef.current?.focus();
    confirmTriggerRef.current = null;
  }

  // Starred first, cap the inline set, then guarantee the active job is shown.
  const { sorted, inline, overflow, favCount } = partitionJobTabs(
    jobs,
    activeJob,
    INLINE_CAP
  );

  return (
    <div className="flex flex-wrap gap-2" ref={menu.wrapRef}>
      {inline.map((j) => {
        const active = j.id === activeJob;
        return (
          <div
            key={j.id}
            className={`flex items-center overflow-hidden rounded-full border ${
              active
                ? 'border-primary-border bg-primary-weak font-semibold text-primary'
                : 'border-border bg-surface text-muted-foreground'
            }`}
            aria-current={active ? 'true' : undefined}
          >
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent py-2 pl-[11px] pr-[3px] text-xs leading-none text-muted-foreground enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-[0.45]"
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
              <Star
                size={14}
                className={j.starred ? 'fill-star text-star' : ''}
                aria-hidden
              />
            </button>
            <button
              type="button"
              className={`flex cursor-pointer items-center gap-2 border-0 bg-transparent py-[7px] pl-[5px] pr-3 text-[13px] ${
                active ? 'font-semibold text-primary' : 'text-muted-foreground'
              }`}
              onClick={() => onSelect(j.id)}
            >
              {j.title}{' '}
              <span
                className={`rounded-full px-[7px] py-px text-[11px] ${
                  active ? 'bg-surface text-primary' : 'bg-surface-2 text-muted-foreground'
                }`}
              >
                {liveCount(j.id)}
              </span>
            </button>
          </div>
        );
      })}

      <div className="relative">
        <Button
          variant="app"
          className="text-muted-foreground"
          title="All jobs"
          {...menu.triggerProps}
        >
          {overflow.length ? `${overflow.length} more` : 'Jobs'}
          <ChevronDown size={14} aria-hidden />
        </Button>
        {menu.open && (
          <div
            className="absolute left-0 top-full z-[25] mt-1.5 flex max-h-[320px] min-w-[260px] flex-col gap-0.5 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-ds"
            {...menu.menuProps}
          >
            {sorted.map((j) => (
              <div className="relative flex items-center gap-1" key={j.id}>
                <button
                  type="button"
                  className="rounded-sm border-0 bg-transparent px-1.5 py-1 text-[15px] leading-none text-muted-foreground hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-[0.35]"
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
                  <Star
                    size={16}
                    className={j.starred ? 'fill-star text-star' : ''}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-sm border-0 px-2 py-[7px] text-left text-[13px] hover:bg-surface-2 ${
                    j.id === activeJob
                      ? 'bg-primary-weak font-semibold text-primary'
                      : 'bg-transparent text-foreground'
                  }`}
                  onClick={() => {
                    onSelect(j.id);
                    menu.close();
                    setConfirmId(null);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{j.title}</span>
                  <span className="rounded-full bg-surface-2 px-[7px] py-px text-[11px] text-muted-foreground">
                    {liveCount(j.id)}
                  </span>
                </button>
                <button
                  type="button"
                  className="rounded-sm border-0 bg-transparent px-2 py-1 text-[13px] text-muted-foreground enabled:hover:bg-rej-bg enabled:hover:text-rej disabled:cursor-not-allowed disabled:opacity-40"
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
                  <X size={14} aria-hidden />
                </button>
                {confirmId === j.id && (
                  <div
                    className="absolute right-1 top-1/2 z-30 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-md border border-border bg-surface p-[3px] shadow-ds"
                    role="dialog"
                    id={`${confirmBaseId}-${j.id}`}
                    aria-label={`Delete ${j.title}?`}
                  >
                    <button
                      type="button"
                      className="rounded-sm border-0 bg-transparent px-2 py-1 text-[13px] font-semibold text-rej hover:bg-rej-bg"
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
                      // autoFocus lands keyboard / screen-reader users on the safe (Cancel) choice and announces the dialog.
                      autoFocus
                      className="rounded-sm border-0 bg-transparent px-1.5 py-1 text-xs text-muted-foreground hover:bg-surface-2"
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
