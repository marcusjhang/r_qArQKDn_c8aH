'use client';

// Add/edit-feedback form: a per-trait 1-4 score picker + note. Feedback is
// always authored by the signed-in user (derived server-side), so there is no
// interviewer picker. The signed-in user gets one entry per candidate (a DB
// unique constraint), edited in place: the button flips to "Update feedback"
// once they've reviewed. The draft state, reset-on-candidate-change and
// validation live in useFeedbackDraft; this is the presentational shell.

import { RATINGS, type Feedback, type Job, type RatingValue } from '@/lib/hiring';
import { Button } from '@/components/ui/button';
import { useFeedbackDraft, type FeedbackEntry } from './useFeedbackDraft';

const RATING_ORDER: RatingValue[] = [1, 2, 3, 4];

export default function AddFeedbackForm({
  resetKey,
  currentUserId,
  feedback,
  job,
  onSave
}: {
  /** Identity of the open candidate — the draft resets when it changes. */
  resetKey: number | null;
  /** The signed-in user's id — the feedback author. */
  currentUserId: number | null;
  feedback: Feedback[];
  job: Job | undefined;
  onSave: (entry: FeedbackEntry) => void;
}) {
  const traits = job?.traits ?? [];
  const fb = useFeedbackDraft(resetKey, currentUserId, feedback, traits, onSave);

  // The whole app is auth-gated, so this is a defensive fallback only.
  if (currentUserId == null) {
    return (
      <div className="add-fb">
        <div className="fb-empty">Sign in to leave feedback.</div>
      </div>
    );
  }

  return (
    <div className="add-fb">
      {traits.length > 0 && (
        <div className="field">
          <span className="label">Trait scores</span>
          <div className="trait-score-inputs">
            {traits.map((t, i) => (
              <div className="trait-score-input" key={t}>
                <span className="trait-score-input-name">
                  <span className="trait-rank">#{i + 1}</span> {t}
                </span>
                <div className="score-picker">
                  {RATING_ORDER.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`sp ${RATINGS[v].cls}`}
                      aria-pressed={fb.traitScores[t] === v}
                      onClick={() => fb.setTrait(t, v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor="feedback-note">
          Note
        </label>
        <textarea
          id="feedback-note"
          value={fb.note}
          maxLength={2000}
          onChange={(e) => fb.setNote(e.target.value)}
          placeholder="What stood out? Concerns?"
        />
      </div>
      {fb.error && <div className="form-error">{fb.error}</div>}
      <Button variant="appPrimary" onClick={() => fb.submit()}>
        {fb.editing ? 'Update feedback' : 'Add feedback'}
      </Button>
    </div>
  );
}
