'use client';

// A single board column: an inline-editable stage title, an options dropdown
// (rename / reorder / delete), and the drop zone holding the stage's cards.
// Drag-and-drop wiring comes from useBoardDnd; the contentEditable rename
// lifecycle from useInlineEdit — this file is left with layout + menu state.

import { useEffect, useRef, useState } from 'react';
import {
  validateStageName,
  canDeleteStage,
  type HiringActions,
  type Candidate,
  type HiringState,
  type Job
} from '@/lib/hiring';
import type { BoardDnd } from './hooks/useBoardDnd';
import { useInlineEdit } from './hooks/useInlineEdit';
import CandidateCard from './CandidateCard';
import StageMenu from './StageMenu';

export default function StageColumn({
  job,
  stage,
  index,
  cards,
  actions,
  state,
  dnd,
  onOpen
}: {
  job: Job;
  stage: string;
  index: number;
  cards: Candidate[];
  actions: HiringActions;
  state: HiringState;
  dnd: BoardDnd;
  onOpen: (id: number) => void;
}) {
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const rename = useInlineEdit({
    value: stage,
    validate: (text) => validateStageName(job.stages, text, index).ok,
    onCommit: (text) => actions.renameStage(job.id, index, text)
  });

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

  const del = canDeleteStage(state, job.id, index);

  return (
    <div
      className={`column${menuOpen ? ' menu-open' : ''}`}
      data-stage={stage}
      {...dnd.columnProps(stage)}
    >
      <div className="col-head">
        <div
          className="col-title"
          ref={rename.ref}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          title="Click to rename this stage"
          onBlur={rename.onBlur}
          onKeyDown={rename.onKeyDown}
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
              deleteReason={del.reason}
              onRename={() => {
                setMenuOpen(false);
                rename.start();
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
              users={state.users}
              dragProps={dnd.cardProps(c.id)}
              onOpen={onOpen}
              onToggleStar={actions.setCandidateStarred}
            />
          ))
        )}
      </div>
    </div>
  );
}
