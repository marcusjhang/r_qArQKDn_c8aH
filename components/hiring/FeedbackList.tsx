'use client';

// The candidate's scoring surface in the drawer: a collapsible "Scores" section
// (rank-weighted overall + per-trait averages) and a collapsible "Feedback"
// section (one entry per interviewer, each collapsing to name + stage + average
// and expanding to the per-trait chips + note).

import { useState } from 'react';
import {
  RATINGS,
  overallScore,
  traitAgg,
  entryTraitAvg,
  roundedRating,
  userById,
  displayName,
  initials,
  type Candidate,
  type Feedback,
  type Job,
  type RatingValue,
  type User
} from '@/lib/hiring';
import { Avatar } from '@/components/ui/avatar';

/** A numeric score chip coloured by its rounded value, or a muted placeholder. */
function ScoreChip({
  value,
  empty = 'Not scored'
}: {
  value: number | null;
  empty?: string;
}) {
  const rounded = roundedRating(value);
  if (value == null || rounded == null)
    return <span className="rating-chip muted">{empty}</span>;
  return (
    <span className={`rating-chip ${RATINGS[rounded].cls}`}>
      {value.toFixed(1)}
    </span>
  );
}

function FeedbackEntryRow({
  entry,
  traits,
  users
}: {
  entry: Feedback;
  traits: string[];
  users: User[];
}) {
  const [open, setOpen] = useState(false);
  const author = userById(users, entry.byUser);
  // Scored traits still tracked on the job, in job (rank) order.
  const scored = traits.filter((t) => entry.traitScores?.[t] != null);
  return (
    <div className="fb-entry">
      <button
        type="button"
        className="fb-head"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar>{initials(author)}</Avatar>
        <span className="fb-who">{displayName(author)}</span>
        {entry.stage && <span className="stage-badge">{entry.stage}</span>}
        <span className="fb-avg">
          <ScoreChip value={entryTraitAvg(entry)} empty="—" />
        </span>
        <span className={`chev${open ? ' open' : ''}`}>▸</span>
      </button>
      {open && (
        <div className="fb-detail">
          {scored.length > 0 ? (
            <div className="fb-traits">
              {scored.map((t) => {
                const v = entry.traitScores[t] as RatingValue;
                return (
                  <span className="trait-tag" key={t}>
                    {t}
                    <span className={`trait-tag-score ${RATINGS[v].cls}`}>
                      {v}
                    </span>
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="fb-empty">No trait scores.</div>
          )}
          {entry.note && <div className="fb-note">{entry.note}</div>}
        </div>
      )}
    </div>
  );
}

export default function FeedbackList({
  view,
  job,
  users
}: {
  view: Candidate | null;
  job: Job | undefined;
  users: User[];
}) {
  const traits = job?.traits ?? [];
  const [scoresOpen, setScoresOpen] = useState(true);
  const overall = view ? overallScore(traits, view) : null;
  const feedback = view?.feedback ?? [];

  return (
    <>
      {traits.length > 0 && (
        <div className="scores">
          <button
            type="button"
            className="section-toggle"
            aria-expanded={scoresOpen}
            onClick={() => setScoresOpen((o) => !o)}
          >
            <span className={`chev${scoresOpen ? ' open' : ''}`}>▸</span>
            <span className="section-title-text">Scores</span>
            <span className="agg">
              <ScoreChip value={overall} />
            </span>
          </button>
          {scoresOpen && (
            <div className="trait-score-grid">
              {traits.map((t, i) => (
                <div className="trait-score-row" key={t}>
                  <span className="trait-rank">#{i + 1}</span>
                  <span className="trait-score-name">{t}</span>
                  <ScoreChip value={view ? traitAgg(view, t) : null} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="section-title">
        Feedback
        {feedback.length > 0 && <span className="agg">{feedback.length}</span>}
      </div>
      <div>
        {feedback.length === 0 ? (
          <div className="fb-empty">
            No feedback yet. Add the first review below.
          </div>
        ) : (
          <div className="feedback">
            {feedback.map((f) => (
              <FeedbackEntryRow
                key={f.id}
                entry={f}
                traits={traits}
                users={users}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
