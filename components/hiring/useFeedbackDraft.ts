'use client';

// Add-feedback form orchestration for the candidate detail drawer: holds the
// draft (interviewer / rating / note), resets it whenever a different candidate
// opens, and validates on submit. Extracted from DetailDrawer so the component
// stays presentational and this flow can be reasoned about (and reused) on its
// own.

import { useEffect, useState } from 'react';
import type { RatingValue, User } from '@/lib/hiring';

export interface FeedbackEntry {
  byUser: number;
  rating: RatingValue;
  note: string;
}

export interface FeedbackDraft {
  who: number;
  setWho: (id: number) => void;
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
 * @param users     the selectable interviewers (from the DB) — the default
 *                  author is the first one.
 * @param onSubmit  persists a valid entry (typically the store's addFeedback).
 */
export function useFeedbackDraft(
  resetKey: number | null,
  users: User[],
  onSubmit: (entry: FeedbackEntry) => void
): FeedbackDraft {
  const [who, setWho] = useState<number>(users[0]?.id ?? 0);
  const [rating, setRating] = useState<RatingValue | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setWho(users[0]?.id ?? 0);
    setRating(null);
    setNote('');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    onSubmit({ byUser: who, rating, note: note.trim() });
    setRating(null);
    setNote('');
    setError('');
    return true;
  }

  return { who, setWho, rating, pickRating, note, setNote, error, submit };
}
