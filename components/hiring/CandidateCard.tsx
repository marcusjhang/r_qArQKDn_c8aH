// A single candidate card in a column: star toggle, name, owner avatar and the
// rating chip. Presentational — drag wiring arrives via `dragProps` (see
// useBoardDrag) and open/star are lifted to callbacks.

import { founderById, type Candidate } from '@/lib/hiring';
import type { BoardDrag } from '@/lib/hiring/hooks';
import RatingChip from './RatingChip';

export default function CandidateCard({
  candidate,
  dragProps,
  onOpen,
  onToggleStar
}: {
  candidate: Candidate;
  dragProps: ReturnType<BoardDrag['cardDragProps']>;
  onOpen: (id: number) => void;
  onToggleStar: (id: number, starred: boolean) => void;
}) {
  const owner = founderById(candidate.owner);
  return (
    <div
      className={`card${candidate.starred ? ' starred' : ''}`}
      {...dragProps}
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
