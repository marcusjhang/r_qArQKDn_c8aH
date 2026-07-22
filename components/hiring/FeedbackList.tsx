'use client';

// Interview-feedback header (aggregate rating badge) plus the list of
// per-interviewer entries.

import {
  RATINGS,
  agg,
  userById,
  roundedRating,
  type Candidate
} from '@/lib/hiring';

export default function FeedbackList({ view }: { view: Candidate | null }) {
  const a = view ? agg(view) : null;
  const aRounded = roundedRating(a);
  return (
    <>
      <div className="section-title">
        Interview feedback
        <span className="agg">
          {a == null || aRounded == null ? (
            <span className="rating-chip muted">No ratings</span>
          ) : (
            <span className={`rating-chip ${RATINGS[aRounded].cls}`}>
              {RATINGS[aRounded].label} · avg {a.toFixed(1)}
            </span>
          )}
        </span>
      </div>

      <div>
        {!view || view.feedback.length === 0 ? (
          <div className="fb-empty">
            No feedback yet — add the first review below.
          </div>
        ) : (
          <div className="feedback">
            {view.feedback.map((f, i) => {
              const r = RATINGS[f.rating];
              const fo = userById(f.byUser);
              return (
                <div className="fb-entry" key={i}>
                  <div className="fb-top">
                    <span className="avatar">{fo.initials}</span>
                    <span className="fb-who">{fo.name}</span>
                    <span
                      className={`rating-chip ${r.cls}`}
                      style={{ marginLeft: 'auto' }}
                    >
                      {r.label}
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
