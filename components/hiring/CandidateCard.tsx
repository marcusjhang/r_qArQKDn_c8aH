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
import { Star } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import RatingChip from './RatingChip';
import ProfileLinks from './ProfileLinks';

// Candidate-status pill tones (fg + bg), matching the old `.st-*` rules.
const STATUS_TONE: Record<Candidate['status'], string> = {
  active: 'bg-primary-weak text-primary',
  onhold: 'bg-hold-bg text-hold',
  rejected: 'bg-rej-bg text-rej',
  hired: 'bg-hired-bg text-hired'
};

export default function CandidateCard({
  candidate,
  traits,
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
  /** The job's ranked trait list — drives the card's weighted overall score. */
  traits: string[];
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
      className={`flex flex-col gap-[7px] rounded-md border p-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:shadow-ds active:cursor-grabbing ${
        candidate.starred
          ? 'border-primary-border bg-primary-weak'
          : 'border-border bg-surface hover:border-border-strong'
      }`}
      {...dragProps}
      data-testid="candidate-card"
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
      <div className="flex items-center justify-between gap-1.5">
        <button
          className="flex-none cursor-pointer border-none bg-transparent p-0 leading-none"
          aria-pressed={candidate.starred}
          title={candidate.starred ? 'Unstar candidate' : 'Star candidate'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(candidate.id, !candidate.starred);
          }}
        >
          <Star
            size={14}
            aria-hidden
            className={
              candidate.starred ? 'fill-star text-star' : 'text-muted-foreground'
            }
          />
        </button>
        <span className="min-w-0 flex-auto truncate text-[13.5px] font-semibold">
          {candidate.name}
        </span>
        <span className="flex flex-none items-center gap-1.5">
          <ProfileLinks
            linkedinUrl={candidate.linkedinUrl}
            githubUrl={candidate.githubUrl}
          />
          <Avatar title={displayName(owner)}>{initials(owner)}</Avatar>
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <RatingChip candidate={candidate} traits={traits} />
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STATUS_TONE[candidate.status]}`}
            title={`Status: ${STATUS[candidate.status]}`}
          >
            {STATUS[candidate.status]}
          </span>
          {showAge && (
            <span
              data-testid="time-tag"
              data-overdue={overdue || undefined}
              className={`flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                overdue
                  ? 'bg-sno-bg text-sno'
                  : 'bg-surface-2 text-muted-foreground'
              }`}
              title={`In ${candidate.stage} for ${ageLabel}`}
            >
              {ageLabel}
            </span>
          )}
        </span>
        <span className="flex flex-none items-center gap-1.5">
          {seniority && (
            <span
              className="whitespace-nowrap rounded-sm border border-primary-border bg-primary-weak px-[7px] py-0.5 text-[10px] font-semibold text-primary"
              title={`${candidate.yearsExperience} years of experience`}
            >
              {seniority} · {candidate.yearsExperience}y
            </span>
          )}
          <span className="whitespace-nowrap rounded-sm bg-surface-2 px-[7px] py-0.5 text-[10px] text-muted-foreground">
            {sourceName(sources, candidate.source)}
          </span>
        </span>
      </div>
    </div>
  );
}
