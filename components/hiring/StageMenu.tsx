'use client';

// Per-stage options dropdown (Decision 1) — replaces the old typed prompt.

export default function StageMenu({
  id,
  index,
  stagesLen,
  canDelete,
  deleteReason,
  onRename,
  onMove,
  onDelete
}: {
  id?: string;
  index: number;
  stagesLen: number;
  canDelete: boolean;
  deleteReason?: string;
  onRename: () => void;
  onMove: (dir: 1 | -1) => void;
  onDelete: () => void;
}) {
  const itemBase =
    'rounded-sm border-none bg-transparent px-2.5 py-[7px] text-left text-[12.5px] disabled:cursor-not-allowed disabled:opacity-55';
  const item = `${itemBase} text-foreground disabled:text-muted-foreground enabled:hover:bg-surface-2`;
  const danger = `${itemBase} text-rej enabled:hover:bg-rej-bg`;
  return (
    <div
      className="absolute right-0 top-full z-[15] mt-1 flex min-w-[150px] flex-col rounded-md border border-border bg-surface p-1 shadow-ds"
      role="menu"
      id={id}
    >
      <button className={item} role="menuitem" onClick={onRename}>
        Rename
      </button>
      <button
        className={item}
        role="menuitem"
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        Move left
      </button>
      <button
        className={item}
        role="menuitem"
        disabled={index === stagesLen - 1}
        onClick={() => onMove(1)}
      >
        Move right
      </button>
      <button
        className={danger}
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
