'use client';

// A single board column: an inline-editable stage title, an options dropdown
// (rename / reorder / delete), and the drop zone holding the stage's cards.
// Drag-and-drop wiring comes from useBoardDnd; the contentEditable rename
// lifecycle from useInlineEdit — this file is left with layout + menu state.

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
import { useDismissableMenu } from './hooks/useDismissableMenu';
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
  const menu = useDismissableMenu();

  const rename = useInlineEdit({
    value: stage,
    validate: (text) => validateStageName(job.stages, text, index).ok,
    onCommit: (text) => actions.renameStage(job.id, index, text)
  });

  const del = canDeleteStage(state, job.id, index);

  return (
    <div
      className={`column${menu.open ? ' menu-open' : ''}`}
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
        <div className="col-menu-wrap" ref={menu.wrapRef}>
          <button
            className="col-menu"
            title="Stage options"
            {...menu.triggerProps}
          >
            ⋯
          </button>
          {menu.open && (
            <StageMenu
              id={menu.menuProps.id}
              index={index}
              stagesLen={job.stages.length}
              canDelete={del.ok}
              deleteReason={del.reason}
              onRename={() => {
                menu.close();
                rename.start();
              }}
              onMove={(dir) => {
                menu.close();
                actions.reorderStage(job.id, index, dir);
              }}
              onDelete={() => {
                menu.close();
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
              traits={job.traits}
              users={state.users}
              sources={state.sources}
              bands={state.bands}
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
