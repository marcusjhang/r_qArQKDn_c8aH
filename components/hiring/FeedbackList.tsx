// The drawer's feedback section header (with the aggregate verdict chip) and the
// list of per-interviewer entries, or an empty hint when there's none yet.

import {
  RATINGS,
  agg,
  founderById,
  roundedRating,
  type Candidate
} from '@/lib/hiring';

export default function FeedbackList({
  candidate
}: {
  candidate: Candidate | null;
}) {
  const average = candidate ? agg(candidate) : null;
  const rounded = roundedRating(average);
  const verdict = rounded == null ? null : RATINGS[rounded];

  return (
    <>
      <div className="section-title">
        Interview feedback
        <span className="agg">
          {verdict == null ? (
            <span className="rating-chip muted">No ratings</span>
          ) : (
            <span className={`rating-chip ${verdict.cls}`}>
              {verdict.label} · avg {average?.toFixed(1)}
            </span>
          )}
        </span>
      </div>

      <div>
        {!candidate || candidate.feedback.length === 0 ? (
          <div className="fb-empty">
            No feedback yet — add the first review below.
          </div>
        ) : (
          <div className="feedback">
            {candidate.feedback.map((f, i) => {
              const rating = RATINGS[f.rating];
              const founder = founderById(f.byFounder);
              return (
                <div className="fb-entry" key={i}>
                  <div className="fb-top">
                    <span className="avatar">{founder.initials}</span>
                    <span className="fb-who">{founder.name}</span>
                    <span
                      className={`rating-chip ${rating.cls}`}
                      style={{ marginLeft: 'auto' }}
                    >
                      {rating.label}
                    </span>
                  </div>
                  {f.note && <div className="fb-note">{f.note}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
