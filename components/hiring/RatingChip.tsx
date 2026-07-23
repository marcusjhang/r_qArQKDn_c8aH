'use client';

// Candidate score badge for a board card: the rank-weighted overall trait
// score (coloured by its rounded value) plus the feedback count, or a muted
// "No scores" when nothing has been scored yet.

import {
  RATINGS,
  overallScore,
  roundedRating,
  type Candidate
} from '@/lib/hiring';

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
    return <span className="rating-chip muted">No scores</span>;
  return (
    <span className={`rating-chip ${RATINGS[rounded].cls}`}>
      {score.toFixed(1)} <span className="n">· {candidate.feedback.length}</span>
    </span>
  );
}
