'use client';

// Add/edit-feedback form: a per-trait 1-4 score picker + note. Feedback is
// always authored by the signed-in user (derived server-side), so there is no
// interviewer picker. The signed-in user gets one entry per candidate (a DB
// unique constraint), edited in place: the button flips to "Update feedback"
// once they've reviewed. The draft state, reset-on-candidate-change and
// validation live in useFeedbackDraft; this is the presentational shell.

import { RATINGS, type Feedback, type Job, type RatingValue } from '@/lib/hiring';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { useFeedbackDraft, type FeedbackEntry } from './useFeedbackDraft';

const RATING_ORDER: RatingValue[] = [1, 2, 3, 4];

// Selected-state colours per rating verdict, matching the former
// `.sp[aria-pressed='true'].<cls>` rules. Keyed by RATINGS[v].cls.
const SP_TONE: Record<string, string> = {
  syes: 'aria-pressed:border-syes aria-pressed:bg-syes-bg aria-pressed:text-syes',
  yes: 'aria-pressed:border-yes aria-pressed:bg-yes-bg aria-pressed:text-yes',
  no: 'aria-pressed:border-no aria-pressed:bg-no-bg aria-pressed:text-no',
  sno: 'aria-pressed:border-sno aria-pressed:bg-sno-bg aria-pressed:text-sno'
};

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
      <div className="flex flex-col gap-2.5 rounded-md border border-dashed border-border-strong bg-surface-2 p-3">
        <div className="text-[12.5px] italic text-muted-foreground">
          Sign in to leave feedback.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-dashed border-border-strong bg-surface-2 p-3">
      {traits.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground">
            Trait scores
          </span>
          <div className="flex flex-col gap-2">
            {traits.map((t, i) => (
              <div className="flex items-center gap-2" key={t}>
                <span className="min-w-0 flex-1 text-[12.5px] text-foreground">
                  <span className="min-w-[22px] text-[11px] font-bold text-muted-foreground">
                    #{i + 1}
                  </span>{' '}
                  {t}
                </span>
                <div className="flex flex-none gap-1">
                  {RATING_ORDER.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`inline-flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border-strong bg-surface text-xs font-bold text-muted-foreground ${SP_TONE[RATINGS[v].cls]}`}
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

      <div className="flex flex-col gap-1.5">
        <label
          className="text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground"
          htmlFor="feedback-note"
        >
          Note
        </label>
        <textarea
          id="feedback-note"
          className="min-h-[60px] w-full resize-y rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary-weak focus:ring-offset-0"
          value={fb.note}
          maxLength={2000}
          onChange={(e) => fb.setNote(e.target.value)}
          placeholder="What stood out? Concerns?"
        />
      </div>
      <FormError message={fb.error} />
      <Button variant="appPrimary" onClick={() => fb.submit()}>
        {fb.editing ? 'Update feedback' : 'Add feedback'}
      </Button>
    </div>
  );
}
