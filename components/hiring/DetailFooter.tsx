'use client';

// Drawer footer: shows the candidate's current stage, how long they've been in
// it (with an overdue warning when the stage's configured limit is exceeded),
// and the Advance / Move back controls. Stage position drives which buttons
// exist (no dead-end buttons), and moving returns to the board so the change is
// visible.

import {
  stageNavigation,
  isTerminal,
  stageOverdue,
  stageSlaFor,
  stageAgeLabel,
  daysInStage,
  type Candidate,
  type Job,
  type StageSla
} from '@/lib/hiring';
import { Button } from '@/components/ui/button';

export default function DetailFooter({
  view,
  job,
  stageSlas,
  now,
  onMove
}: {
  view: Candidate | null;
  job: Job | undefined;
  stageSlas: StageSla[];
  /** Shared clock; null until mounted, so no time UI renders on the server. */
  now: number | null;
  onMove: (dir: 1 | -1) => void;
}) {
  const { canMoveBack, canAdvance } = stageNavigation(job, view);

  // Time-in-stage line, shown for a candidate still moving through the pipeline
  // once the clock has mounted. Terminal candidates aren't stalled, so skip it.
  const showAge = !!view && now != null && !isTerminal(view);
  const overdue = !!view && now != null && stageOverdue(view, stageSlas, now);
  const ageLabel =
    view && now != null ? stageAgeLabel(view.stageEnteredAt, now) : '';
  const daysIn = view && now != null ? daysInStage(view.stageEnteredAt, now) : 0;
  const limit = view ? stageSlaFor(stageSlas, view.stage) : null;

  return (
    <div className="drawer-foot">
      <div className="stage-now">
        Stage: <b>{view?.stage ?? '—'}</b>
        {showAge && (
          <span className={`stage-age${overdue ? ' overdue' : ''}`}>
            In this stage {ageLabel}
            {overdue && limit != null
              ? `, past the ${limit}-day limit (${daysIn} day${
                  daysIn === 1 ? '' : 's'
                })`
              : ''}
          </span>
        )}
      </div>
      {canMoveBack && (
        <Button variant="app" onClick={() => onMove(-1)}>
          ← Move back
        </Button>
      )}
      {canAdvance && (
        <Button variant="appPrimary" onClick={() => onMove(1)}>
          Advance stage →
        </Button>
      )}
    </div>
  );
}
