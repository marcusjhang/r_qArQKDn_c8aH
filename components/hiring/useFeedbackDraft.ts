'use client';

// Add-feedback form orchestration for the candidate detail drawer: holds the
// draft (rating / note), resets it whenever a different candidate opens, and
// validates on submit. Extracted from DetailDrawer so the component stays
// presentational and this flow can be reasoned about (and reused) on its own.
//
// The author is NOT part of the draft: feedback is always attributed to the
// signed-in user, derived server-side. The draft only captures what the
// reviewer actually enters — a rating and a note.

import { useEffect, useState } from 'react';
import type { RatingValue } from '@/lib/hiring';

export interface FeedbackEntry {
  rating: RatingValue;
  note: string;
}

export interface FeedbackDraft {
  rating: RatingValue | null;
  /** Select a rating and clear any pending validation error. */
  pickRating: (v: RatingValue) => void;
  note: string;
  setNote: (note: string) => void;
  error: string;
  /** Validate + submit the draft; returns false (and sets an error) if invalid. */
  submit: () => boolean;
}

/**
 * @param resetKey  identity of the open candidate — the draft resets when it
 *                  changes (a new candidate, or the drawer closing).
 * @param onSubmit  persists a valid entry (typically the store's addFeedback).
 */
export function useFeedbackDraft(
  resetKey: number | null,
  onSubmit: (entry: FeedbackEntry) => void
): FeedbackDraft {
  const [rating, setRating] = useState<RatingValue | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setRating(null);
    setNote('');
    setError('');
  }, [resetKey]);

  function pickRating(v: RatingValue) {
    setRating(v);
    setError('');
  }

  function submit(): boolean {
    if (!rating) {
      setError('Pick a rating first.');
      return false;
    }
    onSubmit({ rating, note: note.trim() });
    setRating(null);
    setNote('');
    setError('');
    return true;
  }

  return { rating, pickRating, note, setNote, error, submit };
}
