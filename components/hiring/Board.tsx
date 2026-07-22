'use client';

// Kanban board: renders the active job's stages as columns of candidate cards
// (Decision 5), with drag-and-drop stage transitions, inline stage editing
// (Decision 1) and the terminal-state filter (Decision 3). Columns, cards and
// the add-stage control live in their own files; drag orchestration is in
// useBoardDrag.

import {
  selectStageCards,
  type HiringActions,
  type HiringState,
  type Job
} from '@/lib/hiring';
import { useBoardDrag } from '@/lib/hiring/hooks';
import AddStageGhost from './AddStageGhost';
import Column from './Column';

export default function Board({
  state,
  actions,
  activeJob,
  showRejected,
  onOpen
}: {
  state: HiringState;
  actions: HiringActions;
  activeJob: number;
  showRejected: boolean;
  onOpen: (id: number) => void;
}) {
  const drag = useBoardDrag(actions.moveTo);

  const job: Job | undefined = state.jobs.find((j) => j.id === activeJob);
  if (!job) return null;

  const jobCandidates = state.candidates.filter((c) => c.jobId === job.id);

  return (
    <div className="board-scroll">
      <div className="board">
        {job.stages.map((stage, index) => (
          <Column
            key={`${stage}-${index}`}
            job={job}
            stage={stage}
            index={index}
            cards={selectStageCards(jobCandidates, stage, showRejected)}
            actions={actions}
            state={state}
            drag={drag}
            onOpen={onOpen}
          />
        ))}
        <AddStageGhost
          job={job}
          onAdd={(name) => actions.addStage(job.id, name)}
        />
      </div>
    </div>
  );
}
