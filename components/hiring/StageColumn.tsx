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
import { MoreHorizontal } from 'lucide-react';
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
  now,
  onOpen
}: {
  job: Job;
  stage: string;
  index: number;
  cards: Candidate[];
  actions: HiringActions;
  state: HiringState;
  dnd: BoardDnd;
  /** Shared clock for time-in-stage UI; null until mounted (see useNow). */
  now: number | null;
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
      className={`relative flex w-60 flex-none basis-60 flex-col gap-2 rounded-lg border border-border bg-surface-2 p-2 [&.dragover]:bg-primary-weak [&.dragover]:outline-2 [&.dragover]:outline-dashed [&.dragover]:outline-primary [&.dragover]:outline-offset-[-3px]${menu.open ? ' z-[5]' : ''}`}
      data-stage={stage}
      {...dnd.columnProps(stage)}
    >
      <div className="flex items-center gap-1.5 px-1.5 pt-1 pb-0.5">
        <div
          className="min-w-0 flex-1 rounded-sm border border-transparent px-1 py-0.5 text-xs font-bold uppercase tracking-[0.02em] text-foreground focus:border-primary-border focus:bg-surface focus:outline-none"
          ref={rename.ref}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          role="textbox"
          aria-label={`Rename ${stage} stage`}
          tabIndex={0}
          title="Click to rename this stage"
          onBlur={rename.onBlur}
          onKeyDown={rename.onKeyDown}
        >
          {stage}
        </div>
        <span className="rounded-full border border-border bg-surface px-[7px] text-[11px] text-muted-foreground">
          {cards.length}
        </span>
        <div className="relative flex-none" ref={menu.wrapRef}>
          <button
            className="inline-flex items-center justify-center rounded-sm border-none bg-transparent px-1 py-0.5 leading-none text-muted-foreground hover:bg-surface hover:text-foreground"
            title="Stage options"
            {...menu.triggerProps}
          >
            <MoreHorizontal size={16} aria-hidden />
          </button>
          {menu.open && (
            <StageMenu
              id={menu.menuProps.id}
              index={index}
              stagesLen={job.stages.length}
              canDelete={del.ok}
              deleteReason={del.ok ? undefined : del.reason}
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
      <div className="flex flex-col gap-2 min-h-6">
        {cards.length === 0 ? (
          <div className="px-1 py-2.5 text-center text-[11px] text-muted-foreground opacity-70">
            Drop here
          </div>
        ) : (
          cards.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              traits={job.traits}
              users={state.users}
              sources={state.sources}
              bands={state.bands}
              stageWarnDays={state.stageWarnDays}
              now={now}
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
