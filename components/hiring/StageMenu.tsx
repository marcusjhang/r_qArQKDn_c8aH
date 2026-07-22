// Per-stage options dropdown (Decision 1): rename, move left/right and delete.
// Purely presentational — every action is a callback owned by the column.

export default function StageMenu({
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
