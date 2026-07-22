'use client';

// Drawer footer: shows the candidate's current stage and the Advance / Move
// back controls. Stage position drives which buttons exist (no dead-end
// buttons), and moving returns to the board so the change is visible.

import { stageNavigation, type Candidate, type Job } from '@/lib/hiring';

export default function DetailFooter({
  view,
  job,
  onMove
}: {
  view: Candidate | null;
  job: Job | undefined;
  onMove: (dir: 1 | -1) => void;
}) {
  const { canMoveBack, canAdvance } = stageNavigation(job, view);

  return (
    <div className="drawer-foot">
      <div className="stage-now">
        Stage: <b>{view?.stage ?? '—'}</b>
      </div>
      {canMoveBack && (
        <button className="btn" onClick={() => onMove(-1)}>
          ← Move back
        </button>
      )}
      {canAdvance && (
        <button className="btn primary" onClick={() => onMove(1)}>
          Advance stage →
        </button>
      )}
    </div>
  );
}
