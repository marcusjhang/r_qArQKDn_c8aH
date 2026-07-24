'use client';

// Shared add/edit candidate form-draft state (owns the draft + validation error); used by both the add modal and detail form so they can't drift.

import { useCallback, useState } from 'react';
import {
  candidateDraftDirty,
  validateCandidateDraft,
  type Candidate,
  type CandidateDraft,
  type CandidateDraftValues
} from '@/lib/hiring';

export interface CandidateDraftControls {
  /** The current draft field values. */
  draft: CandidateDraft;
  /** Patch one or more draft fields (clears any surfaced error). */
  setField: <K extends keyof CandidateDraft>(
    key: K,
    value: CandidateDraft[K]
  ) => void;
  /** The validation message to surface, or '' when clean. */
  error: string;
  /** Set the surfaced error directly (e.g. clear it). */
  setError: (error: string) => void;
  /** Replace the whole draft and clear the error (re-seed on open/cancel). */
  reset: (next: CandidateDraft) => void;
  /** Validate the draft; returns normalized values, or null after surfacing the error. */
  validate: () => CandidateDraftValues | null;
  /** Whether the draft differs from `view` (edit-mode Save gate). */
  dirty: (view: Candidate | null) => boolean;
}

export function useCandidateDraft(
  initial: CandidateDraft
): CandidateDraftControls {
  const [draft, setDraft] = useState<CandidateDraft>(initial);
  const [error, setError] = useState('');

  const setField = useCallback(
    <K extends keyof CandidateDraft>(key: K, value: CandidateDraft[K]) => {
      setDraft((d) => ({ ...d, [key]: value }));
      setError('');
    },
    []
  );

  const reset = useCallback((next: CandidateDraft) => {
    setDraft(next);
    setError('');
  }, []);

  const validate = useCallback((): CandidateDraftValues | null => {
    const result = validateCandidateDraft(draft);
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    setError('');
    return result.values;
  }, [draft]);

  const dirty = useCallback(
    (view: Candidate | null) => candidateDraftDirty(draft, view),
    [draft]
  );

  return { draft, setField, error, setError, reset, validate, dirty };
}
