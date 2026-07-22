'use client';

// A single draggable candidate card in a board column. Drag wiring comes from
// the board's useBoardDnd hook; clicking opens the detail drawer, and the star
// toggles favourite status without opening it.

import {
  userById,
  displayName,
  initials,
  sourceName,
  type Candidate,
  type User,
  type Source
} from '@/lib/hiring';
import RatingChip from './RatingChip';
import ProfileLinks from './ProfileLinks';

export default function CandidateCard({
  candidate,
  users,
  sources,
  dragProps,
  onOpen,
  onToggleStar
}: {
  candidate: Candidate;
  users: User[];
  sources: Source[];
  dragProps: {
    draggable: true;
    onDragStart: (e: React.DragEvent<HTMLElement>) => void;
  };
  onOpen: (id: number) => void;
  onToggleStar: (id: number, starred: boolean) => void;
}) {
  const owner = userById(users, candidate.owner);
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
          <span className="avatar" title={displayName(owner)}>
            {initials(owner)}
          </span>
        </span>
      </div>
      <div className="card-bottom">
        <RatingChip candidate={candidate} />
        <span className="source-tag">{sourceName(sources, candidate.source)}</span>
      </div>
    </div>
  );
}
