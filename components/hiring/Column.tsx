'use client';

// One pipeline stage: a drop target holding its candidate cards, an editable
// title (inline rename) and an options menu (rename / reorder / delete). Drag,
// rename and menu-dismissal orchestration all live in dedicated hooks so this
// file is just wiring and markup.

import {
  canDeleteStage,
  validateStageName,
  type Candidate,
  type HiringActions,
  type HiringState,
  type Job
} from '@/lib/hiring';
import {
  useDismissable,
  useInlineRename,
  type BoardDrag
} from '@/lib/hiring/hooks';
import CandidateCard from './CandidateCard';
import StageMenu from './StageMenu';

export default function Column({
  job,
  stage,
  index,
  cards,
  actions,
  state,
  drag,
  onOpen
}: {
  job: Job;
  stage: string;
  index: number;
  cards: Candidate[];
  actions: HiringActions;
  state: HiringState;
  drag: BoardDrag;
  onOpen: (id: number) => void;
}) {
  const menu = useDismissable();
  const rename = useInlineRename({
    value: stage,
    isValid: (text) => validateStageName(job.stages, text, index).ok,
    onCommit: (text) => actions.renameStage(job.id, index, text)
  });

  const del = canDeleteStage(state, job.id, index);

  return (
    <div
      className={`column${menu.isOpen ? ' menu-open' : ''}`}
      data-stage={stage}
      {...drag.columnDropProps(stage)}
    >
      <div className="col-head">
        <div
          className="col-title"
          ref={rename.ref}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          title="Click to rename this stage"
          onBlur={(e) => rename.commit(e.currentTarget)}
          onKeyDown={rename.handleKeyDown}
        >
          {stage}
        </div>
        <span className="col-count">{cards.length}</span>
        <div className="col-menu-wrap" ref={menu.ref}>
          <button
            className="col-menu"
            title="Stage options"
            aria-haspopup="menu"
            aria-expanded={menu.isOpen}
            onClick={menu.toggle}
          >
            ⋯
          </button>
          {menu.isOpen && (
            <StageMenu
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
              dragProps={drag.cardDragProps(c.id)}
              onOpen={onOpen}
              onToggleStar={actions.setCandidateStarred}
            />
          ))
        )}
      </div>
    </div>
  );
}
