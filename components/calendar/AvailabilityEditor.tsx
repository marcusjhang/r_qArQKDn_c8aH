'use client';

// Per-interviewer weekly availability painter (hour granularity, Mon–Fri) plus
// a list of one-off time-off / extra-hours exceptions. All times are authored
// in COMPANY_TZ. Saving replaces that interviewer's whole weekly pattern.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COMPANY_TZ, FOUNDERS } from '@/lib/hiring/config';
import {
  addException,
  removeException,
  setAvailability,
  setInterviewer
} from '@/lib/hiring/scheduling/actions';
import type {
  Availability,
  AvailabilityException
} from '@/lib/hiring/scheduling/types';
import { fmtTime, founderName } from './util';

const WEEKDAYS = [
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' }
];
const START_HOUR = 8;
const END_HOUR = 19; // exclusive end of the last paintable block (18:00–19:00)
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

/** Build the painted set of "weekday:hour" keys from availability windows. */
function keysFromAvailability(rows: Availability[]): Set<string> {
  const set = new Set<string>();
  for (const w of rows) {
    for (const h of HOURS) {
      const s = h * 60;
      if (w.startMinute <= s && w.endMinute >= s + 60) set.add(`${w.weekday}:${h}`);
    }
  }
  return set;
}

/** Collapse painted hours back into contiguous windows per weekday. */
function windowsFromKeys(keys: Set<string>) {
  const windows: { weekday: number; startMinute: number; endMinute: number }[] = [];
  for (const { n } of WEEKDAYS) {
    const on = HOURS.filter((h) => keys.has(`${n}:${h}`)).sort((a, b) => a - b);
    let run: number[] = [];
    const flush = () => {
      if (run.length) {
        windows.push({
          weekday: n,
          startMinute: run[0] * 60,
          endMinute: (run[run.length - 1] + 1) * 60
        });
        run = [];
      }
    };
    for (let i = 0; i < on.length; i++) {
      if (i > 0 && on[i] !== on[i - 1] + 1) flush();
      run.push(on[i]);
    }
    flush();
  }
  return windows;
}

export default function AvailabilityEditor({
  availability,
  exceptions,
  interviewerSettings,
  currentFounderId
}: {
  availability: Availability[];
  exceptions: AvailabilityException[];
  interviewerSettings: Record<string, boolean>;
  currentFounderId: string | null;
}) {
  const router = useRouter();
  // You only edit your OWN availability — the grid is fixed to the signed-in
  // interviewer, not a picker over everyone.
  const founderId = currentFounderId ?? '';
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [paint, setPaint] = useState<boolean | null>(null); // drag-paint mode

  const mine = useMemo(
    () => availability.filter((a) => a.founderId === founderId),
    [availability, founderId]
  );
  const myExceptions = exceptions.filter((e) => e.founderId === founderId);

  // Reset the painted grid whenever the selected interviewer (or data) changes.
  useEffect(() => {
    setKeys(keysFromAvailability(mine));
  }, [mine]);

  function toggle(key: string, forced?: boolean) {
    setKeys((prev) => {
      const next = new Set(prev);
      const on = forced ?? !next.has(key);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await setAvailability(founderId, windowsFromKeys(keys));
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // Add-exception draft.
  const [exStart, setExStart] = useState('');
  const [exEnd, setExEnd] = useState('');
  const [exKind, setExKind] = useState<'busy' | 'available'>('busy');

  async function submitException() {
    if (!exStart || !exEnd) return;
    await addException(founderId, {
      startsAt: new Date(exStart).toISOString(),
      endsAt: new Date(exEnd).toISOString(),
      kind: exKind
    });
    setExStart('');
    setExEnd('');
    router.refresh();
  }

  return (
    <div className="avail-editor">
      <div className="roster">
        <span className="label">Interviewers</span>
        <div className="roster-toggles">
          {FOUNDERS.map((f) => {
            const on = interviewerSettings[f.id] ?? true;
            return (
              <button
                key={f.id}
                type="button"
                className={`panel-toggle${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={async () => {
                  await setInterviewer(f.id, !on);
                  router.refresh();
                }}
              >
                {f.name}
                <span className="roster-state">{on ? 'interviewer' : 'off'}</span>
              </button>
            );
          })}
        </div>
        <div className="roster-hint">
          Turn someone off to keep them out of interview scheduling. This does
          not affect ownership, feedback, or permissions.
        </div>
      </div>

      <div className="avail-head">
        <div className="field">
          <span className="label">Your availability</span>
          <div className="avail-whoami">
            {currentFounderId ? founderName(currentFounderId) : '—'}
          </div>
        </div>
        <div className="avail-tz">All times in {COMPANY_TZ}</div>
        <button
          className="btn primary"
          onClick={save}
          disabled={saving || !currentFounderId}
        >
          {saving ? 'Saving…' : 'Save availability'}
        </button>
      </div>

      {!currentFounderId ? (
        <div className="fb-empty">
          Your login isn’t linked to an interviewer profile yet, so there’s no
          personal availability to edit.
        </div>
      ) : (
        <>
      <div
        className="avail-grid"
        style={{ ['--cols' as string]: WEEKDAYS.length }}
        onMouseLeave={() => setPaint(null)}
        onMouseUp={() => setPaint(null)}
      >
        <div className="avail-corner" />
        {WEEKDAYS.map((d) => (
          <div key={d.n} className="avail-col-head">
            {d.label}
          </div>
        ))}
        {HOURS.map((h) => (
          <div key={`row-${h}`} className="avail-row" style={{ display: 'contents' }}>
            <div className="avail-hour">{fmtTime(h * 60)}</div>
            {WEEKDAYS.map((d) => {
              const key = `${d.n}:${h}`;
              const on = keys.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={`avail-cell${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onMouseDown={() => {
                    const next = !on;
                    setPaint(next);
                    toggle(key, next);
                  }}
                  onMouseEnter={() => {
                    if (paint !== null) toggle(key, paint);
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="avail-exceptions">
        <div className="section-title">Time off / one-off changes</div>
        {myExceptions.length === 0 ? (
          <div className="fb-empty">No exceptions.</div>
        ) : (
          <ul className="ex-list">
            {myExceptions.map((e) => (
              <li key={e.id} className="ex-row">
                <span className={`ex-kind ex-${e.kind}`}>{e.kind}</span>
                <span className="ex-when">
                  {new Date(e.startsAt).toLocaleString()} →{' '}
                  {new Date(e.endsAt).toLocaleString()}
                </span>
                <button
                  className="sched-clear"
                  onClick={async () => {
                    await removeException(e.id);
                    router.refresh();
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="ex-add">
          <input
            type="datetime-local"
            value={exStart}
            onChange={(e) => setExStart(e.target.value)}
          />
          <input
            type="datetime-local"
            value={exEnd}
            onChange={(e) => setExEnd(e.target.value)}
          />
          <select
            value={exKind}
            onChange={(e) => setExKind(e.target.value as 'busy' | 'available')}
          >
            <option value="busy">Busy</option>
            <option value="available">Available</option>
          </select>
          <button className="btn" onClick={submitException}>
            Add
          </button>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
