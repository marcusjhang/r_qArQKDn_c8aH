// Candidate rating chip: the rounded aggregate verdict plus the feedback count,
// or a muted placeholder when no one has reviewed the candidate yet.

import { RATINGS, candidateRating, type Candidate } from '@/lib/hiring';

export default function RatingChip({ candidate }: { candidate: Candidate }) {
  const value = candidateRating(candidate);
  if (value == null) {
    return <span className="rating-chip muted">No ratings</span>;
  }
  const verdict = RATINGS[value];
  return (
    <span className={`rating-chip ${verdict.cls}`}>
      {verdict.label} <span className="n">· {candidate.feedback.length}</span>
    </span>
  );
}
