'use client';

// State for the inline "add stage" form: a collapsed button that expands into a
// text input with live validation. Auto-focuses the input when it opens.

import { useEffect, useRef, useState } from 'react';

interface AddStageForm {
  isAdding: boolean;
  name: string;
  error: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  open: () => void;
  reset: () => void;
  changeName: (value: string) => void;
  submit: () => void;
}

export function useAddStageForm({
  validate,
  onAdd
}: {
  /** Validate a candidate stage name before adding. */
  validate: (name: string) => { ok: boolean; reason?: string };
  /** Persist an accepted stage name (already-trimmed). */
  onAdd: (name: string) => void;
}): AddStageForm {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding) inputRef.current?.focus();
  }, [isAdding]);

  function reset() {
    setName('');
    setError('');
    setIsAdding(false);
  }

  function changeName(value: string) {
    setName(value);
    setError('');
  }

  function submit() {
    const check = validate(name);
    if (!check.ok) {
      setError(check.reason ?? 'Invalid stage name.');
      return;
    }
    onAdd(name.trim());
    reset();
  }

  return {
    isAdding,
    name,
    error,
    inputRef,
    open: () => setIsAdding(true),
    reset,
    changeName,
    submit
  };
}
