'use client';

// Feedback-draft state (per-trait scores + note) for the signed-in user's single entry on a candidate; loads their existing entry for editing (upsert).

import { useEffect, useRef, useState } from 'react';
import type { Feedback, RatingValue, TraitScores } from '@/lib/hiring';

export interface FeedbackEntry {
  traitScores: TraitScores;
  note: string;
}

export interface FeedbackDraft {
  traitScores: TraitScores;
  /** Set (or, if re-tapped, clear) one trait's score. */
  setTrait: (trait: string, v: RatingValue) => void;
  note: string;
  setNote: (note: string) => void;
  error: string;
  /** True when the signed-in user already has an entry (edit mode). */
  editing: boolean;
  /** Validate + submit the draft; returns false (and sets an error) if invalid. */
  submit: () => boolean;
}

/** Feedback-draft controls; resets when resetKey (the open candidate) changes. */
export function useFeedbackDraft(
  resetKey: number | null,
  currentUserId: number | null,
  feedback: Feedback[],
  jobTraits: string[],
  onSubmit: (entry: FeedbackEntry) => void
): FeedbackDraft {
  const [traitScores, setTraitScores] = useState<TraitScores>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  // Read latest feedback in the effect without depending on it — it changes on every optimistic edit, which would clobber in-progress typing.
  const feedbackRef = useRef<Feedback[]>(feedback);
  feedbackRef.current = feedback;

  // On candidate change, load the signed-in user's existing entry (edit) or start blank.
  useEffect(() => {
    const existing =
      currentUserId != null
        ? feedbackRef.current.find((f) => f.byUser === currentUserId)
        : undefined;
    setTraitScores(existing ? { ...existing.traitScores } : {});
    setNote(existing?.note ?? '');
    setError('');
  }, [resetKey, currentUserId]);

  function setTrait(trait: string, v: RatingValue) {
    setTraitScores((d) => {
      if (d[trait] === v) {
        const { [trait]: _omit, ...rest } = d;
        return rest;
      }
      return { ...d, [trait]: v };
    });
  }

  const editing =
    currentUserId != null && feedback.some((f) => f.byUser === currentUserId);

  function submit(): boolean {
    const scoped: TraitScores = {};
    for (const t of jobTraits) {
      if (traitScores[t] != null) scoped[t] = traitScores[t];
    }
    if (jobTraits.length > 0 && Object.keys(scoped).length === 0) {
      setError('Score at least one trait.');
      return false;
    }
    onSubmit({ traitScores: scoped, note: note.trim() });
    setError('');
    return true;
  }

  return { traitScores, setTrait, note, setNote, error, editing, submit };
}
