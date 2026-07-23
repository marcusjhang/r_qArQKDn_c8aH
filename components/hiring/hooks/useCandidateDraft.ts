'use client';

// Shared add/edit candidate form-draft state. Both the add-candidate modal and
// the detail/edit form drive the same editable fields (name, source, owner,
// profile URLs, years) and validate through the same pure rules, so the two
// can't drift. The hook owns the draft object + the transient validation error;
// callers own submission (add vs. edit call different store actions) and, in
// edit mode, the read-only/editing toggle.

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
  /**
   * Validate the current draft. On success returns the normalized values; on
   * failure surfaces the message via `error` and returns null.
   */
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
