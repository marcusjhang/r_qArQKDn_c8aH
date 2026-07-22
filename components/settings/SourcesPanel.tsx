'use client';

// Manage the candidate-source picklist (the `sources` table) from /settings —
// add, rename, and remove. Mirrors the allowlist panel's styling and its
// useTransition write flow. Server actions return a result object so failures
// (duplicate name, source in use) surface inline instead of throwing.

import { useState, useTransition } from 'react';

type Result = { ok: true } | { ok: false; error: string };

export default function SourcesPanel({
  sources,
  addSource,
  renameSource,
  removeSource
}: {
  sources: { id: number; name: string }[];
  addSource: (name: string) => Promise<Result>;
  renameSource: (id: number, name: string) => Promise<Result>;
  removeSource: (id: number) => Promise<Result>;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  // Which row is being renamed, plus its draft text.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) {
      setError('Enter a source name.');
      return;
    }
    if (sources.some((s) => s.name.toLowerCase() === v.toLowerCase())) {
      setError('That source already exists.');
      return;
    }
    startTransition(async () => {
      const res = await addSource(v);
      if (res.ok) {
        setValue('');
        setError('');
      } else {
        setError(res.error);
      }
    });
  }

  function startEdit(id: number, name: string) {
    setEditingId(id);
    setDraft(name);
    setError('');
  }

  function saveEdit(id: number) {
    const v = draft.trim();
    if (!v) {
      setError('Enter a source name.');
      return;
    }
    startTransition(async () => {
      const res = await renameSource(id, v);
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
      const res = await removeSource(id);
      setError(res.ok ? '' : res.error);
    });
  }

  return (
    <section className="settings-panel">
      <div>
        <p className="settings-section-title">Sources</p>
        <h1 className="settings-title">Candidate sources</h1>
        <p className="settings-sub">
          Where candidates come from. A source in use can&apos;t be removed.
        </p>
      </div>

      <form className="settings-add" onSubmit={add}>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <span className="label">Add source</span>
          <input
            type="text"
            placeholder="e.g. AngelList"
            maxLength={40}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
          />
        </div>
        <button className="btn primary" type="submit" disabled={pending}>
          Add source
        </button>
      </form>
      {error && <div className="form-error">{error}</div>}

      <ul className="email-list">
        {sources.length === 0 && (
          <li className="email-empty">
            No sources yet — add one so candidates can be tagged.
          </li>
        )}
        {sources.map((s) => (
          <li className="email-row" key={s.id}>
            {editingId === s.id ? (
              <>
                <input
                  className="source-edit"
                  type="text"
                  maxLength={40}
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(s.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <button
                  className="btn primary"
                  onClick={() => saveEdit(s.id)}
                  disabled={pending}
                >
                  Save
                </button>
                <button
                  className="btn"
                  onClick={() => setEditingId(null)}
                  disabled={pending}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="email-addr">{s.name}</span>
                <button
                  className="btn"
                  onClick={() => startEdit(s.id, s.name)}
                  disabled={pending}
                  aria-label={`Rename ${s.name}`}
                >
                  Rename
                </button>
                <button
                  className="btn"
                  onClick={() => remove(s.id)}
                  disabled={pending}
                  aria-label={`Remove ${s.name}`}
                >
                  Remove
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
