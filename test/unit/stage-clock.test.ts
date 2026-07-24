// Unit coverage for `withStageClock` (lib/hiring/actions/support.ts) — the
// server-side half of the "restart the stage clock only on a REAL stage change"
// rule. It is the DB-write mirror of the reducer's optimistic `stageEnteredAt`
// logic: reset `stage_entered_at` to now ONLY when the placement moves the
// candidate to a different stage, and OMIT the column from the update set (so it
// is left untouched) on a same-stage no-op.
//
// `support.ts` is `server-only` (aliased to an inert stub by vitest.config.ts)
// but also imports `@/lib/auth`, which calls `NextAuth()` at module load and
// can't be evaluated outside a Next runtime — so we mock that module away.
// `withStageClock` itself is a pure function of (placement, prevStage); the only
// impurity is the `new Date()` it stamps, which we pin with fake timers.

import { afterEach, describe, expect, it, vi } from 'vitest';

// Isolate the pure function from the NextAuth boot in @/lib/auth. (@/lib/db is
// import-side-effect-free — a lazy singleton — so it needs no mock here.)
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { withStageClock } from '@/lib/hiring/actions/support';

describe('withStageClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('restarts the clock (stamps stageEnteredAt to now) on a real stage change', () => {
    const now = new Date('2026-07-24T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = withStageClock(
      { stage: 'Interview', status: 'active' },
      'Applied'
    );

    // The (stage, status) placement carries through, plus a fresh stageEnteredAt
    // that the UPDATE will write to the row.
    expect(result).toEqual({
      stage: 'Interview',
      status: 'active',
      stageEnteredAt: now
    });
  });

  it('preserves the clock (omits stageEnteredAt) on a same-stage no-op', () => {
    const placement = { stage: 'Applied', status: 'onhold' } as const;

    const result = withStageClock(placement, 'Applied');

    // No stageEnteredAt key → the UPDATE set never touches the column, so the
    // overdue timer keeps running from the candidate's original entry.
    expect('stageEnteredAt' in result).toBe(false);
    expect(result).toEqual({ stage: 'Applied', status: 'onhold' });
    // Returned verbatim: the write patch carries only stage/status on a no-op.
    expect(result).toBe(placement);
  });

  it('restarts the clock when a status change also moves the card to a new stage', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    // e.g. setStatus('hired') pulling an Interview card into the terminal Hired
    // stage: the stage changed, so the clock restarts.
    const result = withStageClock({ stage: 'Hired', status: 'hired' }, 'Interview');

    expect(result.stageEnteredAt).toEqual(now);
    expect(result).toMatchObject({ stage: 'Hired', status: 'hired' });
  });

  it('preserves the clock when a status change keeps the card in place', () => {
    // e.g. setStatus('rejected') with no Hired column: the status flips but the
    // stage stays, so the clock must not restart.
    const placement = { stage: 'Interview', status: 'rejected' } as const;

    const result = withStageClock(placement, 'Interview');

    expect('stageEnteredAt' in result).toBe(false);
    expect(result).toEqual({ stage: 'Interview', status: 'rejected' });
  });
});
