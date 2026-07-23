'use client';

// Shared state machine for the settings/members editable-list panels (Sources,
// Seniority bands, Allowlist): an add form plus a list of rows that can be
// edited inline and removed. Owns the add-draft / inline-edit-draft / error /
// pending bookkeeping and the add → validate → write → clear|error flow so the
// panels stay presentational. Generic over the add-form draft `A` and the
// inline-edit draft `E`; panels that don't support inline editing simply never
// call `startEdit`/`saveEdit`.
//
// Writes go through caller-supplied handlers that resolve to a Result, so a
// rejected write (duplicate name, item in use, …) surfaces inline instead of
// throwing. Validation runs client-side first via the caller's `validateAdd` /
// `validateEdit`, which return an error message (or null when valid).

import { useState, useTransition } from 'react';

export type Result = { ok: true } | { ok: false; error: string };

export interface EditableListApi<A, E> {
  /** Whether a write is in flight (disables buttons). */
  pending: boolean;
  /** Current inline-validation / write error, or '' when clear. */
  error: string;
  /** Set the error directly (e.g. for panel-specific pre-checks). */
  setError: (msg: string) => void;
  /** Current add-form draft. */
  addDraft: A;
  /** Patch the add-form draft; clears any error. */
  setAddDraft: (patch: Partial<A>) => void;
  /** Submit the add form: validate, then write on success. */
  submitAdd: (e: React.FormEvent) => void;
  /** Id of the row being edited inline, or null. */
  editingId: number | null;
  /** Current inline-edit draft. */
  editDraft: E;
  /** Patch the inline-edit draft; clears any error. */
  setEditDraft: (patch: Partial<E>) => void;
  /** Begin editing a row with the given seed draft. */
  startEdit: (id: number, draft: E) => void;
  /** Cancel inline editing without writing. */
  cancelEdit: () => void;
  /** Commit the inline edit for a row: validate, then write on success. */
  saveEdit: (id: number) => void;
  /** Remove a row; surfaces any write error inline. */
  remove: (id: number) => void;
}

export function useEditableList<A, E>(opts: {
  /** Initial add-form draft (empty state). */
  emptyAdd: A;
  /** Validate the add draft; return an error message or null when valid. */
  validateAdd: (draft: A) => string | null;
  /** Perform the add write. */
  onAdd: (draft: A) => Promise<Result>;
  /** Validate an inline-edit draft; return an error message or null. */
  validateEdit?: (draft: E) => string | null;
  /** Perform the inline-edit write. */
  onSave?: (id: number, draft: E) => Promise<Result>;
  /** Perform the remove write. */
  onRemove: (id: number) => Promise<Result>;
}): EditableListApi<A, E> {
  const { emptyAdd, validateAdd, onAdd, validateEdit, onSave, onRemove } = opts;

  const [addDraft, setAddDraftState] = useState<A>(emptyAdd);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraftState] = useState<E>({} as E);
  const [pending, startTransition] = useTransition();

  function setAddDraft(patch: Partial<A>) {
    setAddDraftState((prev) => ({ ...prev, ...patch }));
    setError('');
  }

  function setEditDraft(patch: Partial<E>) {
    setEditDraftState((prev) => ({ ...prev, ...patch }));
    setError('');
  }

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const msg = validateAdd(addDraft);
    if (msg !== null) {
      setError(msg);
      return;
    }
    startTransition(async () => {
      const res = await onAdd(addDraft);
      if (res.ok) {
        setAddDraftState(emptyAdd);
        setError('');
      } else {
        setError(res.error);
      }
    });
  }

  function startEdit(id: number, draft: E) {
    setEditingId(id);
    setEditDraftState(draft);
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function saveEdit(id: number) {
    const msg = validateEdit ? validateEdit(editDraft) : null;
    if (msg !== null) {
      setError(msg);
      return;
    }
    if (!onSave) return;
    startTransition(async () => {
      const res = await onSave(id, editDraft);
      if (res.ok) {
        setEditingId(null);
        setError('');
      } else {
        setError(res.error);
      }
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      const res = await onRemove(id);
      setError(res.ok ? '' : res.error);
    });
  }

  return {
    pending,
    error,
    setError,
    addDraft,
    setAddDraft,
    submitAdd,
    editingId,
    editDraft,
    setEditDraft,
    startEdit,
    cancelEdit,
    saveEdit,
    remove
  };
}
