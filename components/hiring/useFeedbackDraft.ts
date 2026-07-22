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
 * @param resetKey       identity of the open candidate — the draft resets when
 *                       it changes (a new candidate, or the drawer closing).
 * @param users          the selectable interviewers (those who haven't reviewed
 *                       this candidate yet).
 * @param currentUserId  the logged-in user — the default author when they are
 *                       still eligible to review, so feedback defaults to you.
 * @param onSubmit       persists a valid entry (typically the store's addFeedback).
 */
export function useFeedbackDraft(
  resetKey: number | null,
  users: User[],
  currentUserId: number | null,
  onSubmit: (entry: FeedbackEntry) => void
): FeedbackDraft {
  // Default to the logged-in user when they can still review, else the first
  // available interviewer.
  const defaultWho = () =>
    users.some((u) => u.id === currentUserId)
      ? (currentUserId as number)
      : (users[0]?.id ?? 0);
  const [who, setWho] = useState<number>(defaultWho);
  const [rating, setRating] = useState<RatingValue | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setWho(defaultWho());
    setRating(null);
    setNote('');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Keep the selected author valid as the available set shrinks — after adding
  // feedback, the just-reviewed interviewer drops out of `users`.
  useEffect(() => {
    if (users.length && !users.some((u) => u.id === who)) {
      setWho(defaultWho());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

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
