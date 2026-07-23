'use client';

// A single draggable candidate card in a board column. Drag wiring comes from
// the board's useBoardDnd hook; clicking opens the detail drawer, and the star
// toggles favourite status without opening it.

import {
  userById,
  displayName,
  initials,
  sourceName,
  seniorityFor,
  isTerminal,
  stageOverdue,
  stageAgeLabel,
  STATUS,
  type Candidate,
  type User,
  type Source,
  type SeniorityBand
} from '@/lib/hiring';
import { Avatar } from '@/components/ui/avatar';
import RatingChip from './RatingChip';
import ProfileLinks from './ProfileLinks';

export default function CandidateCard({
  candidate,
  users,
  sources,
  bands,
  stageWarnDays,
  now,
  dragProps,
  onOpen,
  onToggleStar
}: {
  candidate: Candidate;
  users: User[];
  sources: Source[];
  bands: SeniorityBand[];
  stageWarnDays: number;
  /** Shared clock; null until mounted, so no time UI renders on the server. */
  now: number | null;
  dragProps: {
    draggable: true;
    onDragStart: (e: React.DragEvent<HTMLElement>) => void;
  };
  onOpen: (id: number) => void;
  onToggleStar: (id: number, starred: boolean) => void;
}) {
  const owner = userById(users, candidate.owner);
  const seniority = seniorityFor(bands, candidate.yearsExperience);
  // Time-in-stage: shown for candidates still moving through the pipeline once
  // the clock has mounted. Escalates to a warning past the universal warn
  // threshold (see stageOverdue). Terminal candidates (hired/rejected) aren't
  // "in" a stage in the stalled sense, so they show nothing.
  const showAge = now != null && !isTerminal(candidate);
  const overdue = now != null && stageOverdue(candidate, stageWarnDays, now);
  const ageLabel = now != null ? stageAgeLabel(candidate.stageEnteredAt, now) : '';
  return (
    <div
      className={`card${candidate.starred ? ' starred' : ''}`}
      {...dragProps}
      role="button"
      tabIndex={0}
      aria-label={`Open ${candidate.name}`}
      onClick={() => onOpen(candidate.id)}
      onKeyDown={(e) => {
        // Enter/Space open the card, mirroring a native button — but only when
        // the card itself is focused, so activating an inner control (the star
        // button, the profile links) doesn't also open the drawer.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(candidate.id);
        }
      }}
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
          <Avatar title={displayName(owner)}>{initials(owner)}</Avatar>
        </span>
      </div>
      <div className="card-bottom">
        <span className="card-bottom-left">
          <RatingChip candidate={candidate} />
          <span
            className={`status-pill st-${candidate.status}`}
            title={`Status: ${STATUS[candidate.status]}`}
          >
            {STATUS[candidate.status]}
          </span>
          {showAge && (
            <span
              className={`time-tag${overdue ? ' overdue' : ''}`}
              title={`In ${candidate.stage} for ${ageLabel}`}
            >
              {ageLabel}
            </span>
          )}
        </span>
        <span className="card-tags">
          {seniority && (
            <span
              className="exp-tag"
              title={`${candidate.yearsExperience} years of experience`}
            >
              {seniority} · {candidate.yearsExperience}y
            </span>
          )}
          <span className="source-tag">
            {sourceName(sources, candidate.source)}
          </span>
        </span>
      </div>
    </div>
  );
}
