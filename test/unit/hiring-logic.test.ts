import { describe, it, expect } from 'vitest';
import {
  placeInStage,
  placeWithStatus,
  addStageToPipeline,
  reorderStages,
  removeStage,
  validateStageName,
  stageDeletable,
  selectStageCards,
  terminalStage,
  isTerminalStage,
  daysInStage,
  stageAgeLabel,
  stageOverdue,
  overdueForOwner,
  MS_PER_DAY,
  type Placement
} from '@/lib/hiring/helpers';
import type { Candidate, Status } from '@/lib/hiring/types';

// Minimal candidate factory — only the fields the logic reads matter.
function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 1,
    jobId: 1,
    name: 'Ada',
    stage: 'Applied',
    stageEnteredAt: new Date(0),
    owner: 1,
    source: 1,
    yearsExperience: null,
    status: 'active',
    starred: false,
    linkedinUrl: null,
    githubUrl: null,
    feedback: [],
    ...over
  };
}

describe('terminalStage / isTerminalStage', () => {
  it('resolves the terminal stage as the last one', () => {
    expect(terminalStage(['Applied', 'Interview', 'Hired'])).toBe('Hired');
  });

  it('returns undefined for an empty pipeline', () => {
    expect(terminalStage([])).toBeUndefined();
  });

  it('recognizes the last stage as terminal regardless of its name', () => {
    const stages = ['Applied', 'Interview', 'Onboarded'];
    expect(isTerminalStage(stages, 'Onboarded')).toBe(true);
    expect(isTerminalStage(stages, 'Interview')).toBe(false);
    expect(isTerminalStage([], 'Onboarded')).toBe(false);
  });
});

describe('placeInStage', () => {
  const stages = ['Applied', 'Interview', 'Hired'];

  it('marks a candidate hired when moved into the terminal column', () => {
    const cases: Status[] = ['active', 'onhold', 'rejected'];
    for (const status of cases) {
      expect(
        placeInStage('Hired', { stage: 'Interview', status }, stages)
      ).toEqual({ stage: 'Hired', status: 'hired' });
    }
  });

  it('re-activates a hired candidate moved out of the terminal column', () => {
    expect(
      placeInStage('Interview', { stage: 'Hired', status: 'hired' }, stages)
    ).toEqual({ stage: 'Interview', status: 'active' });
  });

  it('preserves the status for any other move', () => {
    const cases: Status[] = ['active', 'onhold', 'rejected'];
    for (const status of cases) {
      expect(
        placeInStage('Interview', { stage: 'Applied', status }, stages)
      ).toEqual({ stage: 'Interview', status });
    }
  });

  it('auto-hires by position, so a renamed terminal column still hires', () => {
    // The terminal column was renamed 'Hired' -> 'Onboarded'; auto-hire must
    // follow the last stage, not the old literal.
    const renamed = ['Applied', 'Interview', 'Onboarded'];
    expect(
      placeInStage(
        'Onboarded',
        { stage: 'Interview', status: 'active' },
        renamed
      )
    ).toEqual({ stage: 'Onboarded', status: 'hired' });
    // A column that merely happens to be named 'Hired' but isn't last does NOT.
    const moved = ['Applied', 'Hired', 'Onboarded'];
    expect(
      placeInStage('Hired', { stage: 'Applied', status: 'active' }, moved)
    ).toEqual({ stage: 'Hired', status: 'active' });
  });
});

describe('placeWithStatus', () => {
  const stages = ['Applied', 'Interview', 'Hired'];

  it('pulls a newly-hired candidate into the terminal column when one exists', () => {
    expect(
      placeWithStatus('hired', { stage: 'Interview', status: 'active' }, stages)
    ).toEqual({ stage: 'Hired', status: 'hired' });
  });

  it('pulls into the terminal column by position, even when renamed', () => {
    const renamed = ['Applied', 'Interview', 'Onboarded'];
    expect(
      placeWithStatus(
        'hired',
        { stage: 'Interview', status: 'active' },
        renamed
      )
    ).toEqual({ stage: 'Onboarded', status: 'hired' });
  });

  it('leaves the stage untouched when the candidate is already terminal', () => {
    expect(
      placeWithStatus('hired', { stage: 'Hired', status: 'hired' }, stages)
    ).toEqual({ stage: 'Hired', status: 'hired' });
  });

  it('leaves the stage untouched when the job has no stages', () => {
    expect(
      placeWithStatus('hired', { stage: 'Interview', status: 'active' }, [])
    ).toEqual({ stage: 'Interview', status: 'hired' });
  });

  it('leaves the stage untouched for non-hired statuses', () => {
    const current: Placement = { stage: 'Interview', status: 'active' };
    expect(placeWithStatus('active', current, stages)).toEqual({
      stage: 'Interview',
      status: 'active'
    });
    expect(placeWithStatus('rejected', current, stages)).toEqual({
      stage: 'Interview',
      status: 'rejected'
    });
  });
});

describe('addStageToPipeline', () => {
  it('inserts just before the terminal (last) stage', () => {
    const result = addStageToPipeline(
      ['Applied', 'Interview', 'Hired'],
      'Offer'
    );
    expect(result).toEqual({
      ok: true,
      stages: ['Applied', 'Interview', 'Offer', 'Hired']
    });
  });

  it('trims the name before inserting', () => {
    const result = addStageToPipeline(['Applied', 'Hired'], '  Screen  ');
    expect(result.ok && result.stages).toEqual(['Applied', 'Screen', 'Hired']);
  });

  it('rejects a duplicate stage name (case-insensitive) without mutating input', () => {
    const stages = ['Applied', 'Interview', 'Hired'];
    const result = addStageToPipeline(stages, 'interview');
    expect(result.ok).toBe(false);
    expect(stages).toEqual(['Applied', 'Interview', 'Hired']);
  });

  it('rejects an empty name', () => {
    expect(addStageToPipeline(['Applied', 'Hired'], '   ').ok).toBe(false);
  });
});

describe('reorderStages', () => {
  const stages = ['Applied', 'Interview', 'Offer', 'Hired'];

  it('swaps right', () => {
    const result = reorderStages(stages, 1, 1);
    expect(result.ok && result.stages).toEqual([
      'Applied',
      'Offer',
      'Interview',
      'Hired'
    ]);
  });

  it('swaps left', () => {
    const result = reorderStages(stages, 2, -1);
    expect(result.ok && result.stages).toEqual([
      'Applied',
      'Offer',
      'Interview',
      'Hired'
    ]);
  });

  it('fails when the swap would fall off either end', () => {
    expect(reorderStages(stages, 0, -1).ok).toBe(false);
    expect(reorderStages(stages, stages.length - 1, 1).ok).toBe(false);
  });
});

describe('removeStage', () => {
  const stages = ['Applied', 'Interview', 'Offer', 'Hired'];

  it('removes the entry at the given index when deletable', () => {
    const result = removeStage(stages, 1, false);
    expect(result.ok && result.stages).toEqual(['Applied', 'Offer', 'Hired']);
  });

  it('refuses to delete a column that still holds candidates', () => {
    expect(removeStage(stages, 1, true).ok).toBe(false);
  });

  it('refuses to drop below two stages', () => {
    expect(removeStage(['Applied', 'Hired'], 0, false).ok).toBe(false);
  });

  it('fails for a non-existent index', () => {
    expect(removeStage(stages, 99, false).ok).toBe(false);
  });
});

describe('validateStageName', () => {
  const stages = ['Applied', 'Interview', 'Hired'];

  it('accepts a fresh, non-empty, in-bounds name', () => {
    expect(validateStageName(stages, 'Offer').ok).toBe(true);
  });

  it('rejects a case-insensitive duplicate', () => {
    expect(validateStageName(stages, 'interview').ok).toBe(false);
  });

  it('ignores the given index so a stage can keep its own name', () => {
    expect(validateStageName(stages, 'Interview', 1).ok).toBe(true);
  });

  it('rejects names longer than the max', () => {
    expect(validateStageName(stages, 'x'.repeat(49)).ok).toBe(false);
  });
});

describe('stageDeletable', () => {
  it('allows deleting an empty column that keeps at least two stages', () => {
    expect(stageDeletable(['a', 'b', 'c'], false).ok).toBe(true);
  });

  it('blocks when the column still has candidates', () => {
    expect(stageDeletable(['a', 'b', 'c'], true).ok).toBe(false);
  });

  it('blocks when only two stages remain', () => {
    expect(stageDeletable(['a', 'b'], false).ok).toBe(false);
  });
});

describe('selectStageCards', () => {
  const cands = [
    candidate({ id: 1, stage: 'Applied', starred: false }),
    candidate({ id: 2, stage: 'Applied', starred: true }),
    candidate({ id: 3, stage: 'Applied', status: 'rejected' }),
    candidate({ id: 4, stage: 'Interview' })
  ];

  it('keeps only candidates in the requested stage', () => {
    const ids = selectStageCards(cands, 'Interview', true).map((c) => c.id);
    expect(ids).toEqual([4]);
  });

  it('hides rejected candidates by default', () => {
    const ids = selectStageCards(cands, 'Applied', false).map((c) => c.id);
    expect(ids).not.toContain(3);
  });

  it('includes rejected candidates when showRejected is true', () => {
    const ids = selectStageCards(cands, 'Applied', true).map((c) => c.id);
    expect(ids).toContain(3);
  });

  it('floats starred candidates to the top, preserving order within a group', () => {
    const ids = selectStageCards(cands, 'Applied', true).map((c) => c.id);
    // #2 (starred) first, then #1 and #3 in their original relative order.
    expect(ids).toEqual([2, 1, 3]);
  });

  it('does not mutate the input array order', () => {
    const before = cands.map((c) => c.id);
    selectStageCards(cands, 'Applied', true);
    expect(cands.map((c) => c.id)).toEqual(before);
  });
});

describe('daysInStage', () => {
  const now = 100 * MS_PER_DAY;

  it('floors whole days since the candidate entered the stage', () => {
    expect(daysInStage(new Date((100 - 3) * MS_PER_DAY), now)).toBe(3);
    // A partial day floors down.
    expect(daysInStage(now - 3 * MS_PER_DAY - 5 * 3_600_000, now)).toBe(3);
  });

  it('accepts a Date, an ISO string, or epoch ms', () => {
    const entered = (100 - 2) * MS_PER_DAY;
    expect(daysInStage(new Date(entered), now)).toBe(2);
    expect(daysInStage(new Date(entered).toISOString(), now)).toBe(2);
    expect(daysInStage(entered, now)).toBe(2);
  });

  it('clamps a future stageEnteredAt to 0 (never negative)', () => {
    expect(daysInStage(now + 5 * MS_PER_DAY, now)).toBe(0);
  });
});

describe('stageAgeLabel', () => {
  const now = 100 * MS_PER_DAY;

  it('uses whole days', () => {
    expect(stageAgeLabel(now - 4 * MS_PER_DAY, now)).toBe('4d');
  });

  it('shows 0d for the same day, never hours or minutes', () => {
    expect(stageAgeLabel(now - 5 * 3_600_000, now)).toBe('0d');
    expect(stageAgeLabel(now - 12 * 60_000, now)).toBe('0d');
    expect(stageAgeLabel(now - 30_000, now)).toBe('0d');
  });
});

describe('stageOverdue', () => {
  const now = 100 * MS_PER_DAY;
  const warnDays = 7;

  it('is true once the warn threshold is reached (warn after N days)', () => {
    const c = candidate({ stageEnteredAt: new Date((100 - 7) * MS_PER_DAY) });
    expect(stageOverdue(c, warnDays, now)).toBe(true);
  });

  it('is false while still within the threshold', () => {
    const c = candidate({ stageEnteredAt: new Date((100 - 6) * MS_PER_DAY) });
    expect(stageOverdue(c, warnDays, now)).toBe(false);
  });

  it('applies the one threshold to every stage', () => {
    const c = candidate({
      stage: 'Offer',
      stageEnteredAt: new Date((100 - 8) * MS_PER_DAY)
    });
    expect(stageOverdue(c, warnDays, now)).toBe(true);
  });

  it('never warns for terminal candidates (hired / rejected)', () => {
    const base = { stageEnteredAt: new Date((100 - 30) * MS_PER_DAY) };
    expect(
      stageOverdue(candidate({ ...base, status: 'hired' }), warnDays, now)
    ).toBe(false);
    expect(
      stageOverdue(candidate({ ...base, status: 'rejected' }), warnDays, now)
    ).toBe(false);
  });
});

describe('overdueForOwner', () => {
  const now = 100 * MS_PER_DAY;
  const warnDays = 7;
  const old = (days: number) => new Date((100 - days) * MS_PER_DAY);

  it('returns only the given owner’s overdue candidates', () => {
    const cands = [
      candidate({ id: 1, owner: 7, stage: 'Applied', stageEnteredAt: old(20) }), // overdue, mine
      candidate({ id: 2, owner: 9, stage: 'Applied', stageEnteredAt: old(20) }), // overdue, someone else
      candidate({ id: 3, owner: 7, stage: 'Applied', stageEnteredAt: old(3) }) // mine, not overdue
    ];
    const alerts = overdueForOwner(cands, warnDays, 7, now);
    expect(alerts.map((a) => a.candidateId)).toEqual([1]);
    expect(alerts[0]).toMatchObject({ stage: 'Applied', days: 20 });
  });

  it('excludes terminal candidates', () => {
    const cands = [
      candidate({
        id: 2,
        owner: 7,
        stage: 'Interview',
        stageEnteredAt: old(30),
        status: 'hired'
      }),
      candidate({
        id: 3,
        owner: 7,
        stage: 'Interview',
        stageEnteredAt: old(30),
        status: 'rejected'
      })
    ];
    expect(overdueForOwner(cands, warnDays, 7, now)).toEqual([]);
  });

  it('sorts longest-in-stage first', () => {
    const cands = [
      candidate({ id: 1, owner: 7, stage: 'Interview', stageEnteredAt: old(9) }),
      candidate({ id: 2, owner: 7, stage: 'Applied', stageEnteredAt: old(30) })
    ];
    expect(
      overdueForOwner(cands, warnDays, 7, now).map((a) => a.candidateId)
    ).toEqual([2, 1]);
  });
});
