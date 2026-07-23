'use client';

// The candidate's scoring surface in the drawer: a quiet "Scores" summary (the
// rank-weighted overall plus each trait's average) and a "Feedback" list — one
// entry per interviewer, each collapsing to name + stage + average and
// expanding to its per-trait scores and note. Scores read as plain numbers, not
// coloured pills, so the drawer stays calm; the board card keeps the colour cue.

import { useState } from 'react';
import {
  overallScore,
  traitAgg,
  entryTraitAvg,
  userById,
  displayName,
  initials,
  type Candidate,
  type Feedback,
  type Job,
  type User
} from '@/lib/hiring';
import { Avatar } from '@/components/ui/avatar';

/** Render a 1-4 average as a fixed-decimal number, or a muted placeholder. */
function score(value: number | null, empty = 'Not scored') {
  return value == null ? (
    <span className="score-val none">{empty}</span>
  ) : (
    <span className="score-val">{value.toFixed(1)}</span>
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
  const avg = entryTraitAvg(entry);
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
        <span className="fb-right">
          {avg != null && <span className="fb-avg">{avg.toFixed(1)}</span>}
          <span className={`chev${open ? ' open' : ''}`}>▸</span>
        </span>
      </button>
      {open && (
        <div className="fb-detail">
          {scored.length > 0 ? (
            <div className="fb-traits">
              {scored.map((t) => (
                <span className="trait-tag" key={t}>
                  {t}
                  <span className="trait-tag-score">
                    {entry.traitScores[t]}
                  </span>
                </span>
              ))}
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
  const overall = view ? overallScore(traits, view) : null;
  const feedback = view?.feedback ?? [];

  return (
    <>
      {traits.length > 0 && (
        <div className="scores">
          <div className="scores-head">
            <span className="section-title-text">Scores</span>
            {overall == null ? (
              <span className="score-overall none">No scores yet</span>
            ) : (
              <span className="score-overall">{overall.toFixed(1)}</span>
            )}
          </div>
          <div className="score-rows">
            {traits.map((t) => (
              <div className="score-row" key={t}>
                <span className="score-trait">{t}</span>
                {score(view ? traitAgg(view, t) : null)}
              </div>
            ))}
          </div>
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
