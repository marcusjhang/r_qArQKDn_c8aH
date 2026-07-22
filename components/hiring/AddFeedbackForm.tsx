'use client';

// Add-feedback form: a 4-point rating picker + note. The author is always the
// signed-in user (the server derives it from the session), so there is no
// interviewer picker. Draft state, reset-on-candidate-change and validation
// live in useFeedbackDraft; this component is the presentational shell.

import { RATINGS, type RatingValue } from '@/lib/hiring';
import { useFeedbackDraft, type FeedbackEntry } from './useFeedbackDraft';

const RATING_ORDER: RatingValue[] = [1, 2, 3, 4];

export default function AddFeedbackForm({
  resetKey,
  canReview,
  onAdd
}: {
  /** Identity of the open candidate — the draft resets when it changes. */
  resetKey: number | null;
  /** Whether the signed-in user may still add feedback (hasn't reviewed yet). */
  canReview: boolean;
  onAdd: (entry: FeedbackEntry) => void;
}) {
  const fb = useFeedbackDraft(resetKey, onAdd);

  // The signed-in user has already reviewed this candidate (one entry each) —
  // nothing to add.
  if (!canReview) {
    return (
      <div className="add-fb">
        <div className="fb-empty">You've already left feedback.</div>
      </div>
    );
  }

  return (
    <div className="add-fb">
      <div className="field">
        <span className="label">Rating</span>
        <div className="rating-picker">
          {RATING_ORDER.map((v) => (
            <button
              key={v}
              className={`rp ${RATINGS[v].cls}`}
              aria-pressed={fb.rating === v}
              onClick={() => fb.pickRating(v)}
            >
              {RATINGS[v].label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">Note</span>
        <textarea
          value={fb.note}
          maxLength={2000}
          onChange={(e) => fb.setNote(e.target.value)}
          placeholder="What stood out? Concerns?"
        />
      </div>
      {fb.error && <div className="form-error">{fb.error}</div>}
      <button className="btn primary" onClick={() => fb.submit()}>
        Add feedback
      </button>
    </div>
  );
}
