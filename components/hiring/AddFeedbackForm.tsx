'use client';

// Add-feedback form: 4-point rating picker + note. Feedback is always authored
// by the signed-in user (derived server-side), so there is no interviewer
// picker — `canReview` gates whether the form shows at all: the current user
// gets one entry per candidate (enforced by a DB unique constraint), so once
// they've reviewed, the form is replaced with a done message. The draft state,
// reset-on-candidate-change and validation live in useFeedbackDraft; this
// component is the presentational shell around that hook.

import { RATINGS, type RatingValue } from '@/lib/hiring';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { useFeedbackDraft, type FeedbackEntry } from './useFeedbackDraft';

const RATING_ORDER: RatingValue[] = [1, 2, 3, 4];

export default function AddFeedbackForm({
  resetKey,
  canReview,
  onAdd
}: {
  /** Identity of the open candidate — the draft resets when it changes. */
  resetKey: number | null;
  /** Whether the signed-in user can still leave feedback (one entry each). */
  canReview: boolean;
  onAdd: (entry: FeedbackEntry) => void;
}) {
  const fb = useFeedbackDraft(resetKey, onAdd);

  // The signed-in user has already reviewed this candidate (or isn't a
  // resolvable reviewer) — nothing to add.
  if (!canReview) {
    return (
      <div className="add-fb">
        <div className="fb-empty">You&rsquo;ve already left feedback.</div>
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
        <label className="label" htmlFor="feedback-note">Note</label>
        <textarea
          id="feedback-note"
          value={fb.note}
          maxLength={2000}
          onChange={(e) => fb.setNote(e.target.value)}
          placeholder="What stood out? Concerns?"
        />
      </div>
      <FormError message={fb.error} />
      <Button variant="appPrimary" onClick={() => fb.submit()}>
        Add feedback
      </Button>
    </div>
  );
}
