'use client';

// Kanban board: renders the active job's stages as columns, candidate cards
// (Decision 5), drag-and-drop stage transitions, inline stage editing
// (Decision 1) and the terminal-state filter (Decision 3).

import { RATINGS } from '@/lib/hiring/config';
import { agg, founderById, isTerminal } from '@/lib/hiring/helpers';
import { canDeleteStage, type HiringActions } from '@/lib/hiring/store';
import type { Candidate, HiringState, Job } from '@/lib/hiring/types';

function RatingChip({ candidate }: { candidate: Candidate }) {
  const a = agg(candidate);
  if (a == null) return <span className="rating-chip muted">No ratings</span>;
  const r = RATINGS[Math.round(a) as 1 | 2 | 3 | 4];
  return (
    <span className={`rating-chip ${r.cls}`}>
      {r.label} <span className="n">· {candidate.feedback.length}</span>
    </span>
  );
}

function CandidateCard({
  candidate,
  onOpen
}: {
  candidate: Candidate;
  onOpen: (id: number) => void;
}) {
  const owner = founderById(candidate.owner);
  return (
    <div
      className="card"
      draggable
      onDragStart={(e) =>
        e.dataTransfer.setData('text/plain', String(candidate.id))
      }
      onClick={() => onOpen(candidate.id)}
    >
      <div className="card-top">
        <span className="card-name">{candidate.name}</span>
        <span className="avatar" title={owner.name}>
          {owner.initials}
        </span>
      </div>
      <div className="card-bottom">
        <RatingChip candidate={candidate} />
        <span className="source-tag">{candidate.source}</span>
      </div>
    </div>
  );
}

function Column({
  job,
  stage,
  index,
  cards,
  actions,
  state,
  onOpen
}: {
  job: Job;
  stage: string;
  index: number;
  cards: Candidate[];
  actions: HiringActions;
  state: HiringState;
  onOpen: (id: number) => void;
}) {
  function commitRename(text: string) {
    actions.renameStage(job.id, index, text.trim() || stage);
  }

  function openStageMenu() {
    const act = window.prompt(
      `Stage "${stage}" — type: rename, left, right, or delete`,
      'rename'
    );
    if (!act) return;
    const a = act.trim().toLowerCase();
    if (a === 'delete') {
      const guard = canDeleteStage(state, job.id, index);
      if (!guard.ok) {
        window.alert(guard.reason ?? 'This stage cannot be deleted.');
        return;
      }
      actions.deleteStage(job.id, index);
    } else if (a === 'left') {
      actions.reorderStage(job.id, index, -1);
    } else if (a === 'right') {
      actions.reorderStage(job.id, index, 1);
    } else if (a === 'rename') {
      const n = window.prompt('Rename stage:', stage);
      if (n) actions.renameStage(job.id, index, n.trim());
    }
  }

  return (
    <div
      className="column"
      data-stage={stage}
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
      }}
      onDragLeave={(e) => e.currentTarget.classList.remove('dragover')}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        const id = Number(e.dataTransfer.getData('text/plain'));
        if (id) actions.moveTo(id, stage);
      }}
    >
      <div className="col-head">
        <div
          className="col-title"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          title="Click to rename this stage"
          onBlur={(e) => commitRename(e.currentTarget.textContent ?? '')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.currentTarget as HTMLElement).blur();
            }
          }}
        >
          {stage}
        </div>
        <span className="col-count">{cards.length}</span>
        <button
          className="col-menu"
          title="Stage options"
          onClick={openStageMenu}
        >
          ⋯
        </button>
      </div>
      <div className="col-body">
        {cards.length === 0 ? (
          <div className="empty-hint">Drop here</div>
        ) : (
          cards.map((c) => (
            <CandidateCard key={c.id} candidate={c} onOpen={onOpen} />
          ))
        )}
      </div>
    </div>
  );
}

export default function Board({
  state,
  actions,
  activeJob,
  showTerminal,
  onOpen
}: {
  state: HiringState;
  actions: HiringActions;
  activeJob: string;
  showTerminal: boolean;
  onOpen: (id: number) => void;
}) {
  const job = state.jobs.find((j) => j.id === activeJob);
  if (!job) return null;

  function addStage() {
    const name = window.prompt(
      'New stage name (added to this job only):',
      'Team & Culture'
    );
    if (!name || !name.trim()) return;
    actions.addStage(job!.id, name.trim());
  }

  const jobCandidates = state.candidates.filter((c) => c.job === job.id);

  return (
    <div className="board-scroll">
      <div className="board">
        {job.stages.map((stage, index) => {
          const cards = jobCandidates.filter(
            (c) => c.stage === stage && (showTerminal || !isTerminal(c))
          );
          return (
            <Column
              key={`${stage}-${index}`}
              job={job}
              stage={stage}
              index={index}
              cards={cards}
              actions={actions}
              state={state}
              onOpen={onOpen}
            />
          );
        })}
        <button className="add-stage" onClick={addStage}>
          ＋ Add stage
        </button>
      </div>
    </div>
  );
}
