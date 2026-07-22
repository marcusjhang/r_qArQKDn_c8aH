'use client';

// Manage the seniority bands (the years-of-experience → label mapping) from
// /settings — add, edit (label + threshold), and remove. Mirrors the Sources
// panel's styling and useTransition write flow. Each band starts at `minYears`
// whole years; a candidate's band is the highest threshold their experience
// meets. Server actions return a result object so failures (duplicate
// threshold) surface inline instead of throwing.

import { useState, useTransition } from 'react';

type Result = { ok: true } | { ok: false; error: string };

export default function SeniorityBandsPanel({
  bands,
  maxYears,
  addBand,
  updateBand,
  removeBand
}: {
  bands: { id: number; label: string; minYears: number }[];
  maxYears: number;
  addBand: (label: string, minYears: number) => Promise<Result>;
  updateBand: (id: number, label: string, minYears: number) => Promise<Result>;
  removeBand: (id: number) => Promise<Result>;
}) {
  const [label, setLabel] = useState('');
  const [years, setYears] = useState('');
  const [error, setError] = useState('');
  // Which row is being edited, plus its draft label + threshold.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftYears, setDraftYears] = useState('');
  const [pending, startTransition] = useTransition();

  function parseYears(raw: string): number | null {
    const n = Number(raw.trim());
    if (raw.trim() === '' || !Number.isInteger(n) || n < 0 || n > maxYears) {
      return null;
    }
    return n;
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const l = label.trim();
    const y = parseYears(years);
    if (!l) {
      setError('Enter a band label.');
      return;
    }
    if (y === null) {
      setError(`Enter a threshold of 0–${maxYears} years.`);
      return;
    }
    if (bands.some((b) => b.minYears === y)) {
      setError('A band with that threshold already exists.');
      return;
    }
    startTransition(async () => {
      const res = await addBand(l, y);
      if (res.ok) {
        setLabel('');
        setYears('');
        setError('');
      } else {
        setError(res.error);
      }
    });
  }

  function startEdit(id: number, l: string, y: number) {
    setEditingId(id);
    setDraftLabel(l);
    setDraftYears(String(y));
    setError('');
  }

  function saveEdit(id: number) {
    const l = draftLabel.trim();
    const y = parseYears(draftYears);
    if (!l) {
      setError('Enter a band label.');
      return;
    }
    if (y === null) {
      setError(`Enter a threshold of 0–${maxYears} years.`);
      return;
    }
    startTransition(async () => {
      const res = await updateBand(id, l, y);
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
      const res = await removeBand(id);
      setError(res.ok ? '' : res.error);
    });
  }

  return (
    <section className="settings-panel">
      <div>
        <p className="settings-section-title">Seniority</p>
        <h1 className="settings-title">Seniority bands</h1>
        <p className="settings-sub">
          Maps years of experience to a label; the highest matching threshold
          wins.
        </p>
      </div>

      <form className="settings-add" onSubmit={add}>
        <div className="field" style={{ flex: '2 1 160px' }}>
          <span className="label">Label</span>
          <input
            type="text"
            placeholder="e.g. Staff"
            maxLength={40}
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setError('');
            }}
          />
        </div>
        <div className="field" style={{ flex: '0 0 120px' }}>
          <span className="label">From (years)</span>
          <input
            type="number"
            min={0}
            max={maxYears}
            step={1}
            placeholder="0"
            value={years}
            onChange={(e) => {
              setYears(e.target.value);
              setError('');
            }}
          />
        </div>
        <button className="btn primary" type="submit" disabled={pending}>
          Add band
        </button>
      </form>
      {error && <div className="form-error">{error}</div>}

      <ul className="email-list">
        {bands.length === 0 && (
          <li className="email-empty">
            No bands yet — add one so candidates show a seniority label.
          </li>
        )}
        {bands.map((b) => (
          <li className="email-row" key={b.id}>
            {editingId === b.id ? (
              <>
                <input
                  className="source-edit"
                  type="text"
                  maxLength={40}
                  autoFocus
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(b.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <input
                  className="band-years-edit"
                  type="number"
                  min={0}
                  max={maxYears}
                  step={1}
                  value={draftYears}
                  onChange={(e) => setDraftYears(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(b.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <button
                  className="btn primary"
                  onClick={() => saveEdit(b.id)}
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
                <span className="email-addr">
                  {b.label} <span className="band-threshold">· {b.minYears}+ yrs</span>
                </span>
                <button
                  className="btn"
                  onClick={() => startEdit(b.id, b.label, b.minYears)}
                  disabled={pending}
                  aria-label={`Edit ${b.label}`}
                >
                  Edit
                </button>
                <button
                  className="btn"
                  onClick={() => remove(b.id)}
                  disabled={pending}
                  aria-label={`Remove ${b.label}`}
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
