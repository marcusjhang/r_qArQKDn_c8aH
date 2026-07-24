'use client';

// Kanban board: renders the active job's stages as columns, candidate cards
// (Decision 5), drag-and-drop stage transitions, inline stage editing
// (Decision 1) and the terminal-state filter (Decision 3).
//
// This file is now a thin layout: per-column rendering lives in StageColumn, and
// the stage/card logic is split across CandidateCard, StageMenu, AddStageForm
// and the useBoardDnd / useInlineEdit hooks.

import {
  selectStageCards,
  type HiringActions,
  type HiringState
} from '@/lib/hiring';
import { useBoardDnd } from './hooks/useBoardDnd';
import StageColumn from './StageColumn';
import AddStageForm from './AddStageForm';

export default function Board({
  state,
  actions,
  activeJob,
  showRejected,
  now,
  onOpen
}: {
  state: HiringState;
  actions: HiringActions;
  activeJob: number;
  showRejected: boolean;
  /** Shared clock for time-in-stage UI; null until mounted (see useNow). */
  now: number | null;
  onOpen: (id: number) => void;
}) {
  const dnd = useBoardDnd(actions.moveTo);
  const job = state.jobs.find((j) => j.id === activeJob);
  if (!job) return null;

  const jobCandidates = state.candidates.filter((c) => c.jobId === job.id);

  return (
    <div className="flex-auto min-h-0 overflow-auto px-4 pt-2 pb-6">
      <div className="flex items-start gap-3 min-h-[60px] pr-4">
        {job.stages.map((stage, index) => (
          <StageColumn
            // Stage names are unique within a job (validateStageName), so keying
            // by name — not array index — keeps each column's local UI state
            // (open menu, inline-rename focus) bound to its stage across a
            // middle reorder/delete instead of remapping to a neighbour.
            key={stage}
            job={job}
            stage={stage}
            index={index}
            cards={selectStageCards(jobCandidates, stage, showRejected)}
            actions={actions}
            state={state}
            dnd={dnd}
            now={now}
            onOpen={onOpen}
          />
        ))}
        <AddStageForm
          job={job}
          onAdd={(name) => actions.addStage(job.id, name)}
        />
      </div>
    </div>
  );
}
