'use client';

// Aggregate rating badge for a candidate card: shows the rounded rating label
// plus the feedback count, or a muted "No ratings" when none exist.

import { RATINGS, candidateRating, type Candidate } from '@/lib/hiring';

export default function RatingChip({ candidate }: { candidate: Candidate }) {
  const value = candidateRating(candidate);
  if (value == null)
    return <span className="rating-chip muted">No ratings</span>;
  const r = RATINGS[value];
  return (
    <span className={`rating-chip ${r.cls}`}>
      {r.label} <span className="n">· {candidate.feedback.length}</span>
    </span>
  );
}
