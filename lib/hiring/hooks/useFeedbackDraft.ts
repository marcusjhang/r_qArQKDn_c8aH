'use client';

// Draft state for the detail drawer's "add feedback" form: interviewer, rating,
// note and a validation error. The draft resets whenever a different candidate
// opens (keyed on `openId`).

import { useEffect, useState } from 'react';
import { FOUNDERS } from '@/lib/hiring/config';
import type { RatingValue } from '@/lib/hiring/types';

export interface FeedbackDraftEntry {
  byFounder: string;
  rating: RatingValue;
  note: string;
}

interface FeedbackDraft {
  byFounder: string;
  setByFounder: (id: string) => void;
  rating: RatingValue | null;
  pickRating: (v: RatingValue) => void;
  note: string;
  setNote: (note: string) => void;
  error: string;
  submit: () => void;
}

export function useFeedbackDraft(
  openId: number | null,
  onSubmit: (entry: FeedbackDraftEntry) => void
): FeedbackDraft {
  const [byFounder, setByFounder] = useState<string>(FOUNDERS[0].id);
  const [rating, setRating] = useState<RatingValue | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  // Reset the draft whenever a different candidate opens.
  useEffect(() => {
    setByFounder(FOUNDERS[0].id);
    setRating(null);
    setNote('');
    setError('');
  }, [openId]);

  function pickRating(v: RatingValue) {
    setRating(v);
    setError('');
  }

  function submit() {
    if (!rating) {
      setError('Pick a rating first.');
      return;
    }
    onSubmit({ byFounder, rating, note: note.trim() });
    setRating(null);
    setNote('');
    setError('');
  }

  return {
    byFounder,
    setByFounder,
    rating,
    pickRating,
    note,
    setNote,
    error,
    submit
  };
}
