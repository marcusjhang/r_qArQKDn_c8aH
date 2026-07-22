'use client';

// Kanban board: renders the active job's stages as columns, candidate cards
// (Decision 5), drag-and-drop stage transitions, inline stage editing
// (Decision 1) and the terminal-state filter (Decision 3).

import { useEffect, useRef, useState } from 'react';
import {
  RATINGS,
  agg,
  founderById,
  selectStageCards,
  validateStageName,
  MAX_STAGE_NAME,
  canDeleteStage,
  type HiringActions,
  type Candidate,
  type HiringState,
  type Job
} from '@/lib/hiring';

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
  onOpen,
  onToggleStar
}: {
  candidate: Candidate;
  onOpen: (id: number) => void;
  onToggleStar: (id: number, starred: boolean) => void;
}) {
  const owner = founderById(candidate.owner);
  return (
    <div
      className={`card${candidate.starred ? ' starred' : ''}`}
      draggable
      onDragStart={(e) =>
        e.dataTransfer.setData('text/plain', String(candidate.id))
      }
      onClick={() => onOpen(candidate.id)}
    >
      <div className="card-top">
        <button
          className="card-star"
          aria-pressed={candidate.starred}
          title={candidate.starred ? 'Unstar candidate' : 'Star candidate'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(candidate.id, !candidate.starred);
          }}
        >
          {candidate.starred ? '★' : '☆'}
        </button>
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

// Per-stage options dropdown (Decision 1) — replaces the old typed prompt.
function StageMenu({
  index,
  stagesLen,
  canDelete,
  deleteReason,
  onRename,
  onMove,
  onDelete
}: {
  index: number;
  stagesLen: number;
  canDelete: boolean;
  deleteReason?: string;
  onRename: () => void;
  onMove: (dir: 1 | -1) => void;
  onDelete: () => void;
}) {
  return (
    <div className="stage-menu" role="menu">
      <button className="stage-menu-item" role="menuitem" onClick={onRename}>
        Rename
      </button>
      <button
        className="stage-menu-item"
        role="menuitem"
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        Move left
      </button>
      <button
        className="stage-menu-item"
        role="menuitem"
        disabled={index === stagesLen - 1}
        onClick={() => onMove(1)}
      >
        Move right
      </button>
      <button
        className="stage-menu-item danger"
        role="menuitem"
        disabled={!canDelete}
        title={canDelete ? undefined : deleteReason}
        onClick={onDelete}
      >
        Delete stage
      </button>
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
  const titleRef = useRef<HTMLDivElement>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (
        menuWrapRef.current &&
        !menuWrapRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Commit an inline rename; revert the DOM on empty / no-op / duplicate.
  function commitRename(el: HTMLElement) {
    const text = (el.textContent ?? '').trim();
    // Revert on no-op or anything the shared validator rejects.
    if (text === stage || !validateStageName(job.stages, text, index).ok) {
      el.textContent = stage;
      return;
    }
    actions.renameStage(job.id, index, text);
  }

  function startRename() {
    const el = titleRef.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  const del = canDeleteStage(state, job.id, index);

  return (
    <div
      className={`column${menuOpen ? ' menu-open' : ''}`}
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
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          title="Click to rename this stage"
          onBlur={(e) => commitRename(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              e.currentTarget.textContent = stage;
              e.currentTarget.blur();
            }
          }}
        >
          {stage}
        </div>
        <span className="col-count">{cards.length}</span>
        <div className="col-menu-wrap" ref={menuWrapRef}>
          <button
            className="col-menu"
            title="Stage options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            ⋯
          </button>
          {menuOpen && (
            <StageMenu
              index={index}
              stagesLen={job.stages.length}
              canDelete={del.ok}
              deleteReason={del.ok ? undefined : del.reason}
              onRename={() => {
                setMenuOpen(false);
                startRename();
              }}
              onMove={(dir) => {
                setMenuOpen(false);
                actions.reorderStage(job.id, index, dir);
              }}
              onDelete={() => {
                setMenuOpen(false);
                actions.deleteStage(job.id, index);
              }}
            />
          )}
        </div>
      </div>
      <div className="col-body">
        {cards.length === 0 ? (
          <div className="empty-hint">Drop here</div>
        ) : (
          cards.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              onOpen={onOpen}
              onToggleStar={actions.setCandidateStarred}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Inline "add stage" — a text input with a live duplicate guard.
function AddStageGhost({
  job,
  onAdd
}: {
  job: Job;
  onAdd: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function reset() {
    setName('');
    setError('');
    setAdding(false);
  }

  function submit() {
    const check = validateStageName(job.stages, name);
    if (!check.ok) {
      setError(check.reason ?? 'Invalid stage name.');
      return;
    }
    onAdd(name.trim());
    reset();
  }

  if (!adding) {
    return (
      <button className="add-stage" onClick={() => setAdding(true)}>
        ＋ Add stage
      </button>
    );
  }

  return (
    <div className="add-stage-form">
      <input
        ref={inputRef}
        type="text"
        placeholder="Stage name"
        maxLength={MAX_STAGE_NAME}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            reset();
          }
        }}
      />
      {error && <div className="form-error">{error}</div>}
      <div className="add-stage-actions">
        <button type="button" className="btn" onClick={reset}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={submit}>
          Add
        </button>
      </div>
    </div>
  );
}

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
  const job = state.jobs.find((j) => j.id === activeJob);
  if (!job) return null;

  const jobCandidates = state.candidates.filter((c) => c.jobId === job.id);

  return (
    <div className="board-scroll">
      <div className="board">
        {job.stages.map((stage, index) => {
          const cards = selectStageCards(jobCandidates, stage, showRejected);
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
        <AddStageGhost
          job={job}
          onAdd={(name) => actions.addStage(job.id, name)}
        />
      </div>
    </div>
  );
}
