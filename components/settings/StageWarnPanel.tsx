'use client';

// Manage the one universal "warn after N days in a stage" threshold from
// /settings. A single number that applies to every stage: the board flags a
// candidate as overdue once they have sat in their current stage for at least
// this many days. Persisted via the updateStageWarnDays server action.

import { useState, useTransition } from 'react';
import type { SettingsResult } from '@/lib/settings-types';

export default function StageWarnPanel({
  stageWarnDays,
  maxDays,
  updateStageWarnDays
}: {
  stageWarnDays: number;
  maxDays: number;
  updateStageWarnDays: (days: number) => Promise<SettingsResult>;
}) {
  const [days, setDays] = useState(String(stageWarnDays));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function parseDays(raw: string): number | null {
    const n = Number(raw.trim());
    if (raw.trim() === '' || !Number.isInteger(n) || n < 1 || n > maxDays) {
      return null;
    }
    return n;
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const d = parseDays(days);
    if (d === null) {
      setError(`Enter a number of days from 1 to ${maxDays}.`);
      return;
    }
    startTransition(async () => {
      const res = await updateStageWarnDays(d);
      if (res.ok) {
        setError('');
        setSaved(true);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <section className="settings-panel">
      <div>
        <p className="settings-section-title">Pipeline</p>
        <h1 className="settings-title">Stalled applicant warning</h1>
        <p className="settings-sub">
          Warn on the board when an applicant has sat in a stage too long. One
          threshold applies to every stage.
        </p>
      </div>

      <form className="settings-add" onSubmit={save}>
        <div className="field" style={{ flex: '0 0 160px' }}>
          <label className="label" htmlFor="warn-days">
            Warn after (days)
          </label>
          <input
            id="warn-days"
            type="number"
            min={1}
            max={maxDays}
            step={1}
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              setError('');
              setSaved(false);
            }}
          />
        </div>
        <button className="btn primary" type="submit" disabled={pending}>
          Save
        </button>
        {saved && <span className="settings-saved">Saved</span>}
      </form>
      {error && <div className="form-error">{error}</div>}
    </section>
  );
}
