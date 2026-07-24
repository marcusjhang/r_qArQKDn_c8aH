'use client';

// Manage the one universal "warn after N days in a stage" threshold from
// /settings; a single number applied to every stage.

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import type { SettingsResult } from '@/lib/settings-types';

const INPUT_CLASS =
  'w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-weak)] focus:outline-none';

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
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
          Pipeline
        </p>
        <h2 className="mb-1 text-[17px] font-bold">Stalled applicant warning</h2>
        <p className="text-[12.5px] text-muted-foreground">
          Warn on the board when an applicant has sat in a stage too long. One
          threshold applies to every stage.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" onSubmit={save}>
        <div className="flex flex-col gap-1.5" style={{ flex: '0 0 160px' }}>
          <label
            className="text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground"
            htmlFor="warn-days"
          >
            Warn after (days)
          </label>
          <input
            id="warn-days"
            className={INPUT_CLASS}
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
        <Button variant="appPrimary" type="submit" disabled={pending}>
          Save
        </Button>
        {saved && (
          <span
            className="self-center text-[12.5px] font-semibold text-ok"
            data-testid="settings-saved"
          >
            Saved
          </span>
        )}
      </form>
      <FormError message={error} />
    </section>
  );
}
