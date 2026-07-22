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
  HIRED_STAGE,
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
    owner: 'bo',
    source: 'LinkedIn',
    status: 'active',
    starred: false,
    linkedinUrl: null,
    githubUrl: null,
    feedback: [],
    ...over
  };
}

describe('placeInStage', () => {
  it('marks a candidate hired when moved into the Hired column', () => {
    const cases: Status[] = ['active', 'onhold', 'rejected'];
    for (const status of cases) {
      expect(placeInStage(HIRED_STAGE, { stage: 'Interview', status })).toEqual(
        {
          stage: HIRED_STAGE,
          status: 'hired'
        }
      );
    }
  });

  it('re-activates a hired candidate moved out of the Hired column', () => {
    expect(
      placeInStage('Interview', { stage: HIRED_STAGE, status: 'hired' })
    ).toEqual({ stage: 'Interview', status: 'active' });
  });

  it('preserves the status for any other move', () => {
    const cases: Status[] = ['active', 'onhold', 'rejected'];
    for (const status of cases) {
      expect(placeInStage('Interview', { stage: 'Applied', status })).toEqual({
        stage: 'Interview',
        status
      });
    }
  });
});

describe('placeWithStatus', () => {
  const stages = ['Applied', 'Interview', 'Hired'];

  it('pulls a newly-hired candidate into the Hired column when one exists', () => {
    expect(
      placeWithStatus('hired', { stage: 'Interview', status: 'active' }, stages)
    ).toEqual({ stage: 'Hired', status: 'hired' });
  });

  it('leaves the stage untouched when the candidate is already in Hired', () => {
    expect(
      placeWithStatus('hired', { stage: 'Hired', status: 'hired' }, stages)
    ).toEqual({ stage: 'Hired', status: 'hired' });
  });

  it('leaves the stage untouched when the job has no Hired column', () => {
    expect(
      placeWithStatus('hired', { stage: 'Interview', status: 'active' }, [
        'Applied',
        'Interview'
      ])
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
