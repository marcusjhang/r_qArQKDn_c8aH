'use client';

// Add/edit-feedback form orchestration for the candidate detail drawer: holds
// the draft (per-trait scores + note) for the SIGNED-IN user's single entry on
// a candidate. Feedback is always authored by the signed-in user (derived
// server-side), so there is no interviewer picker. If the user already has an
// entry it is loaded for editing (upsert); otherwise the draft starts blank.
// Extracted from the form so the component stays presentational.

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

/**
 * @param resetKey       identity of the open candidate — the draft resets when
 *                       it changes.
 * @param currentUserId  the signed-in user (the author); used to load their
 *                       existing entry for editing.
 * @param feedback       the candidate's current feedback (to prefill on edit).
 * @param jobTraits      the job's trait list (scores are filtered against it).
 * @param onSubmit       persists a valid entry (typically the store's saveFeedback).
 */
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

  // Read the latest feedback inside the effect without depending on it (it
  // changes on every optimistic edit, which would clobber in-progress typing).
  const feedbackRef = useRef<Feedback[]>(feedback);
  feedbackRef.current = feedback;

  // On candidate change, load the signed-in user's existing entry (edit) or
  // start blank.
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
