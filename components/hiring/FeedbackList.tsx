'use client';

// The candidate's scoring surface in the drawer: a quiet "Scores" summary (the
// rank-weighted overall plus each trait's average) and a "Feedback" list — one
// entry per interviewer, each collapsing to name + stage + average and
// expanding to its per-trait scores and note. Scores read as plain numbers, not
// coloured pills, so the drawer stays calm; the board card keeps the colour cue.

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
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
import InfoHint from './InfoHint';

/** Render a 1-4 average as a fixed-decimal number, or a muted placeholder. */
function score(value: number | null, empty = 'Not scored') {
  return value == null ? (
    <span className="text-xs font-normal text-muted-foreground">{empty}</span>
  ) : (
    <span className="font-semibold tabular-nums text-foreground">
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
  const avg = entryTraitAvg(entry);
  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-2.5"
      data-testid="feedback-entry"
    >
      <button
        type="button"
        data-testid="feedback-entry-head"
        className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar>{initials(author)}</Avatar>
        <span className="text-[12.5px] font-semibold">{displayName(author)}</span>
        {entry.stage && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {entry.stage}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {avg != null && (
            <span className="text-[12.5px] font-bold tabular-nums text-foreground">
              {avg.toFixed(1)}
            </span>
          )}
          <ChevronRight
            size={14}
            aria-hidden
            className={`text-muted-foreground transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
        </span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1.5" data-testid="feedback-entry-detail">
          {scored.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {scored.map((t) => (
                <span
                  className="inline-flex items-baseline gap-1.5 rounded-full bg-surface-2 px-2.5 py-[3px] text-[11px] font-medium text-muted-foreground"
                  key={t}
                >
                  {t}
                  <span className="text-[11px] font-bold tabular-nums text-foreground">
                    {entry.traitScores[t]}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[12.5px] italic text-muted-foreground">
              No trait scores.
            </div>
          )}
          {entry.note && (
            <div className="whitespace-pre-wrap text-[12.5px] text-foreground">
              {entry.note}
            </div>
          )}
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
  const [scoresOpen, setScoresOpen] = useState(false);

  return (
    <>
      {traits.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.03em] text-muted-foreground">
              Score
            </span>
            <InfoHint
              label="How the score is calculated"
              title="Formula"
            >
              <p>
                Each trait&rsquo;s score is the average of its 1 to 4 ratings
                across all feedback.
              </p>
              <p className="font-mono text-[11.5px] text-muted-foreground">
                overall = sum(weight &times; trait average) / sum(weights)
              </p>
              <p>A trait at rank #k of N has weight N + 1 - k.</p>
            </InfoHint>
            {overall == null ? (
              <span className="ml-auto text-xs font-medium text-muted-foreground">
                No scores yet
              </span>
            ) : (
              <button
                type="button"
                className="ml-auto flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0"
                aria-expanded={scoresOpen}
                title={scoresOpen ? 'Hide the per-trait breakdown' : 'Show the per-trait breakdown'}
                onClick={() => setScoresOpen((o) => !o)}
              >
                <span className="text-[15px] font-bold tabular-nums text-foreground">
                  {overall.toFixed(1)}
                </span>
                <ChevronRight
                  size={14}
                  aria-hidden
                  className={`text-muted-foreground transition-transform duration-150 ${scoresOpen ? 'rotate-90' : ''}`}
                />
              </button>
            )}
          </div>
          {scoresOpen && overall != null && (
            <div className="flex flex-col gap-1">
              {traits.map((t) => (
                <div className="flex items-baseline gap-2 text-[13px]" key={t}>
                  <span className="min-w-0 flex-1 text-foreground">{t}</span>
                  {score(view ? traitAgg(view, t) : null)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.03em] text-muted-foreground">
        Feedback
        {feedback.length > 0 && (
          <span className="ml-auto normal-case tracking-normal">
            {feedback.length}
          </span>
        )}
      </div>
      <div>
        {feedback.length === 0 ? (
          <div className="text-[12.5px] italic text-muted-foreground">
            No feedback yet. Add the first review below.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {feedback.map((f) => (
              // Key on the stable author, not `f.id`: a new entry's optimistic
              // temp id is reconciled to the real DB id once the write lands
              // (store.saveFeedback), and keying on the changing id would remount
              // the row — collapsing a just-expanded entry. `byUser` is unique
              // per candidate (one entry per interviewer) and never changes.
              <FeedbackEntryRow
                key={f.byUser}
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
