'use client';

// Add-feedback form: interviewer picker, the 4-point rating picker (Decision 4)
// and a note. Draft state and reset-on-open live in useFeedbackDraft.

import { FOUNDERS, RATINGS, type RatingValue } from '@/lib/hiring';
import { useFeedbackDraft, type FeedbackDraftEntry } from '@/lib/hiring/hooks';

const RATING_ORDER: RatingValue[] = [1, 2, 3, 4];

export default function AddFeedbackForm({
  openId,
  onSubmit
}: {
  openId: number | null;
  onSubmit: (entry: FeedbackDraftEntry) => void;
}) {
  const draft = useFeedbackDraft(openId, onSubmit);

  return (
    <div className="add-fb">
      <div className="field">
        <span className="label">Interviewer</span>
        <select
          value={draft.byFounder}
          onChange={(e) => draft.setByFounder(e.target.value)}
        >
          {FOUNDERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span className="label">Rating</span>
        <div className="rating-picker">
          {RATING_ORDER.map((v) => (
            <button
              key={v}
              className={`rp ${RATINGS[v].cls}`}
              aria-pressed={draft.rating === v}
              onClick={() => draft.pickRating(v)}
            >
              {RATINGS[v].label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">Note</span>
        <textarea
          value={draft.note}
          maxLength={2000}
          onChange={(e) => draft.setNote(e.target.value)}
          placeholder="What stood out? Concerns?"
        />
      </div>
      {draft.error && <div className="form-error">{draft.error}</div>}
      <button className="btn primary" onClick={draft.submit}>
        Add feedback
      </button>
    </div>
  );
}
