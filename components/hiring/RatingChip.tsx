'use client';

// Candidate score badge: the rank-weighted overall score (coloured by rounded value) + feedback count, or a muted "No scores".

import {
  RATINGS,
  overallScore,
  roundedRating,
  type Candidate
} from '@/lib/hiring';

// Shared pill shape for both the scored and the muted "No scores" states.
const CHIP_BASE =
  'inline-flex items-center flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px]';

// The RATINGS[v].cls verdict key → the pill's fg/bg tone utilities.
const TONE: Record<string, string> = {
  syes: 'bg-syes-bg text-syes',
  yes: 'bg-yes-bg text-yes',
  no: 'bg-no-bg text-no',
  sno: 'bg-sno-bg text-sno'
};

export default function RatingChip({
  candidate,
  traits
}: {
  candidate: Candidate;
  traits: string[];
}) {
  const score = overallScore(traits, candidate);
  const rounded = roundedRating(score);
  if (score == null || rounded == null)
    return (
      <span className={`${CHIP_BASE} font-medium bg-surface-2 text-muted-foreground`}>
        No scores
      </span>
    );
  return (
    <span className={`${CHIP_BASE} font-semibold ${TONE[RATINGS[rounded].cls]}`}>
      {score.toFixed(1)}{' '}
      <span className="font-medium opacity-75">· {candidate.feedback.length}</span>
    </span>
  );
}
