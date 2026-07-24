'use client';

// Drawer footer: shows the candidate's current stage, how long they've been in
// it (turning red past the universal warn threshold), and the Advance / Move
// back controls. Stage position drives which buttons exist (no dead-end
// buttons), and moving returns to the board so the change is visible.

import { ArrowLeft, ArrowRight } from 'lucide-react';
import {
  stageNavigation,
  isTerminal,
  stageOverdue,
  stageAgeLabel,
  type Candidate,
  type Job
} from '@/lib/hiring';
import { Button } from '@/components/ui/button';

export default function DetailFooter({
  view,
  job,
  stageWarnDays,
  now,
  onMove
}: {
  view: Candidate | null;
  job: Job | undefined;
  stageWarnDays: number;
  /** Shared clock; null until mounted, so no time UI renders on the server. */
  now: number | null;
  onMove: (dir: 1 | -1) => void;
}) {
  const { canMoveBack, canAdvance } = stageNavigation(job, view);

  // Time-in-stage line, shown for a candidate still moving through the pipeline
  // once the clock has mounted. Terminal candidates aren't stalled, so skip it.
  // Turns red (.overdue) once past the universal warn threshold.
  const showAge = !!view && now != null && !isTerminal(view);
  const overdue = !!view && now != null && stageOverdue(view, stageWarnDays, now);
  const ageLabel =
    view && now != null ? stageAgeLabel(view.stageEnteredAt, now) : '';

  return (
    <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-border bg-surface p-4">
      <div className="min-w-0 flex-1 text-xs text-muted-foreground">
        Stage: <b className="text-foreground">{view?.stage ?? '—'}</b>
        {showAge && (
          <span
            className={`mt-1 block text-[11.5px] ${overdue ? 'font-semibold text-sno' : 'text-muted-foreground'}`}
          >
            In this stage {ageLabel}
          </span>
        )}
      </div>
      {canMoveBack && (
        <Button variant="app" onClick={() => onMove(-1)}>
          <ArrowLeft size={14} />
          Move back
        </Button>
      )}
      {canAdvance && (
        <Button variant="appPrimary" onClick={() => onMove(1)}>
          Advance stage
          <ArrowRight size={14} />
        </Button>
      )}
    </div>
  );
}
