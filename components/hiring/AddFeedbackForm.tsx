'use client';

// Add-feedback form: interviewer + 4-point rating picker + note. The draft
// state, reset-on-candidate-change and validation live in useFeedbackDraft;
// this component is the presentational shell around that hook.

import { USERS, RATINGS, type RatingValue } from '@/lib/hiring';
import { useFeedbackDraft, type FeedbackEntry } from './useFeedbackDraft';

const RATING_ORDER: RatingValue[] = [1, 2, 3, 4];

export default function AddFeedbackForm({
  resetKey,
  onAdd
}: {
  /** Identity of the open candidate — the draft resets when it changes. */
  resetKey: number | null;
  onAdd: (entry: FeedbackEntry) => void;
}) {
  const fb = useFeedbackDraft(resetKey, onAdd);

  return (
    <div className="add-fb">
      <div className="field">
        <span className="label">Interviewer</span>
        <select value={fb.who} onChange={(e) => fb.setWho(e.target.value)}>
          {USERS.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
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
