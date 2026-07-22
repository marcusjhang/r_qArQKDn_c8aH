'use client';

// A single draggable candidate card in a board column. Drag wiring comes from
// the board's useBoardDnd hook; clicking opens the detail drawer, and the star
// toggles favourite status without opening it.

import { attentionReasons, founderById, type Candidate } from '@/lib/hiring';
import RatingChip from './RatingChip';

export default function CandidateCard({
  candidate,
  now,
  dragProps,
  onOpen,
  onToggleStar
}: {
  candidate: Candidate;
  now: number | null;
  dragProps: {
    draggable: true;
    onDragStart: (e: React.DragEvent<HTMLElement>) => void;
  };
  onOpen: (id: number) => void;
  onToggleStar: (id: number, starred: boolean) => void;
}) {
  const owner = founderById(candidate.owner);
  // Attention flags are time-relative → computed only once `now` is known
  // (client-side, post-mount) to avoid a hydration mismatch.
  const reasons = now == null ? [] : attentionReasons(candidate, now);
  return (
    <div
      className={`card${candidate.starred ? ' starred' : ''}${
        reasons.length ? ' needs-attention' : ''
      }`}
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
      {reasons.length > 0 && (
        <div className="attention-chip" title={reasons.join(' · ')}>
          <span className="attention-ico" aria-hidden="true">
            ⚠
          </span>
          {reasons.join(' · ')}
        </div>
      )}
      <div className="card-bottom">
        <RatingChip candidate={candidate} />
        <span className="source-tag">{candidate.source}</span>
      </div>
    </div>
  );
}
