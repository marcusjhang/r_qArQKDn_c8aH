'use client';

// Manage the stage time-limits (the "warn after N days in a stage" mapping)
// from /settings — add, edit (stage + days), and remove. Mirrors the Seniority
// bands panel's styling and useTransition write flow. Limits are opt-in per
// stage: a stage only warns on the board once it has a limit here. Server
// actions return a result object so failures (duplicate stage) surface inline
// instead of throwing.

import { useState, useTransition } from 'react';

type Result = { ok: true } | { ok: false; error: string };

export default function StageTimeLimitsPanel({
  stageSlas,
  maxDays,
  addStageSla,
  updateStageSla,
  removeStageSla
}: {
  stageSlas: { id: number; stage: string; maxDays: number }[];
  maxDays: number;
  addStageSla: (stage: string, maxDays: number) => Promise<Result>;
  updateStageSla: (
    id: number,
    stage: string,
    maxDays: number
  ) => Promise<Result>;
  removeStageSla: (id: number) => Promise<Result>;
}) {
  const [stage, setStage] = useState('');
  const [days, setDays] = useState('');
  const [error, setError] = useState('');
  // Which row is being edited, plus its draft stage + threshold.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftStage, setDraftStage] = useState('');
  const [draftDays, setDraftDays] = useState('');
  const [pending, startTransition] = useTransition();

  function parseDays(raw: string): number | null {
    const n = Number(raw.trim());
    if (raw.trim() === '' || !Number.isInteger(n) || n < 1 || n > maxDays) {
      return null;
    }
    return n;
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const s = stage.trim();
    const d = parseDays(days);
    if (!s) {
      setError('Enter a stage name.');
      return;
    }
    if (d === null) {
      setError(`Enter a limit of 1–${maxDays} days.`);
      return;
    }
    if (stageSlas.some((x) => x.stage.toLowerCase() === s.toLowerCase())) {
      setError('That stage already has a time limit.');
      return;
    }
    startTransition(async () => {
      const res = await addStageSla(s, d);
      if (res.ok) {
        setStage('');
        setDays('');
        setError('');
      } else {
        setError(res.error);
      }
    });
  }

  function startEdit(id: number, s: string, d: number) {
    setEditingId(id);
    setDraftStage(s);
    setDraftDays(String(d));
    setError('');
  }

  function saveEdit(id: number) {
    const s = draftStage.trim();
    const d = parseDays(draftDays);
    if (!s) {
      setError('Enter a stage name.');
      return;
    }
    if (d === null) {
      setError(`Enter a limit of 1–${maxDays} days.`);
      return;
    }
    startTransition(async () => {
      const res = await updateStageSla(id, s, d);
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
      const res = await removeStageSla(id);
      setError(res.ok ? '' : res.error);
    });
  }

  return (
    <section className="settings-panel">
      <div>
        <p className="settings-section-title">Pipeline</p>
        <h1 className="settings-title">Stage time limits</h1>
        <p className="settings-sub">
          Warn on the board when an applicant has sat in a stage too long. Limits
          are per stage name and apply across every job — a stage only warns once
          you set a limit for it.
        </p>
      </div>

      <form className="settings-add" onSubmit={add}>
        <div className="field" style={{ flex: '2 1 160px' }}>
          <span className="label">Stage</span>
          <input
            type="text"
            placeholder="e.g. Interview"
            maxLength={48}
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              setError('');
            }}
          />
        </div>
        <div className="field" style={{ flex: '0 0 140px' }}>
          <span className="label">Warn after (days)</span>
          <input
            type="number"
            min={1}
            max={maxDays}
            step={1}
            placeholder="7"
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              setError('');
            }}
          />
        </div>
        <button className="btn primary" type="submit" disabled={pending}>
          Add limit
        </button>
      </form>
      {error && <div className="form-error">{error}</div>}

      <ul className="email-list">
        {stageSlas.length === 0 && (
          <li className="email-empty">
            No limits yet — add one to warn when applicants stall in a stage.
          </li>
        )}
        {stageSlas.map((s) => (
          <li className="email-row" key={s.id}>
            {editingId === s.id ? (
              <>
                <input
                  className="source-edit"
                  type="text"
                  maxLength={48}
                  autoFocus
                  value={draftStage}
                  onChange={(e) => setDraftStage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(s.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <input
                  className="band-years-edit"
                  type="number"
                  min={1}
                  max={maxDays}
                  step={1}
                  value={draftDays}
                  onChange={(e) => setDraftDays(e.target.value)}
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
                <span className="email-addr">
                  {s.stage}{' '}
                  <span className="band-threshold">
                    · warn after {s.maxDays} day{s.maxDays === 1 ? '' : 's'}
                  </span>
                </span>
                <button
                  className="btn"
                  onClick={() => startEdit(s.id, s.stage, s.maxDays)}
                  disabled={pending}
                  aria-label={`Edit ${s.stage} limit`}
                >
                  Edit
                </button>
                <button
                  className="btn"
                  onClick={() => remove(s.id)}
                  disabled={pending}
                  aria-label={`Remove ${s.stage} limit`}
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
