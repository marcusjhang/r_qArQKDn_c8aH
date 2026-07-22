'use client';

// A single draggable candidate card in a board column. Drag wiring comes from
// the board's useBoardDnd hook; clicking opens the detail drawer, and the star
// toggles favourite status without opening it.

import { userById, type Candidate } from '@/lib/hiring';
import RatingChip from './RatingChip';
import ProfileLinks from './ProfileLinks';

export default function CandidateCard({
  candidate,
  dragProps,
  onOpen,
  onToggleStar
}: {
  candidate: Candidate;
  dragProps: {
    draggable: true;
    onDragStart: (e: React.DragEvent<HTMLElement>) => void;
  };
  onOpen: (id: number) => void;
  onToggleStar: (id: number, starred: boolean) => void;
}) {
  const owner = userById(candidate.owner);
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
        <span className="card-top-right">
          <ProfileLinks
            linkedinUrl={candidate.linkedinUrl}
            githubUrl={candidate.githubUrl}
          />
          <span className="avatar" title={owner.name}>
            {owner.initials}
          </span>
        </span>
      </div>
      <div className="card-bottom">
        <RatingChip candidate={candidate} />
        <span className="source-tag">{candidate.source}</span>
      </div>
    </div>
  );
}
