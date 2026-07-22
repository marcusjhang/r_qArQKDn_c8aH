'use client';

// Kanban board: renders the active job's stages as columns, candidate cards
// (Decision 5), drag-and-drop stage transitions, inline stage editing
// (Decision 1) and the terminal-state filter (Decision 3).
//
// This file is now a thin layout: per-column rendering lives in Column, and the
// stage/card logic is split across CandidateCard, StageMenu, AddStageGhost and
// the useBoardDnd / useInlineEdit hooks.

import {
  selectStageCards,
  type HiringActions,
  type HiringState
} from '@/lib/hiring';
import { useBoardDnd } from './hooks/useBoardDnd';
import Column from './Column';
import AddStageGhost from './AddStageGhost';

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
  const dnd = useBoardDnd(actions.moveTo);
  const job = state.jobs.find((j) => j.id === activeJob);
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
            dnd={dnd}
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
