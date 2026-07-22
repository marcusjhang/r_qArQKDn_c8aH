import { describe, it, expect } from 'vitest';
import { getBoard, hiringService, type BoardReader } from '@/lib/hiring/service';
import type { Candidate, Job } from '@/lib/hiring/types';

// Because getBoard reads through an injected BoardReader (rather than the db
// singleton), it can be exercised with in-memory rows — no database, no
// mocking of Drizzle's query builder.
describe('getBoard', () => {
  const jobs: Job[] = [
    {
      id: 1,
      title: 'Founding Engineer',
      stages: ['Applied', 'Hired'],
      starred: true
    }
  ];
  const candidates: Candidate[] = [
    {
      id: 10,
      jobId: 1,
      name: 'Ada',
      stage: 'Applied',
      owner: 'bo',
      source: 'Referral',
      status: 'active',
      starred: false,
      feedback: []
    }
  ];

  const fakeReader: BoardReader = {
    loadJobs: async () => jobs,
    loadCandidates: async () => candidates
  };

  it('composes the reader results into a HiringState payload', async () => {
    const state = await getBoard(fakeReader);
    expect(state).toEqual({ jobs, candidates });
  });

  it('reads jobs and candidates concurrently from the reader', async () => {
    const calls: string[] = [];
    const reader: BoardReader = {
      loadJobs: async () => {
        calls.push('jobs');
        return jobs;
      },
      loadCandidates: async () => {
        calls.push('candidates');
        return candidates;
      }
    };
    await getBoard(reader);
    expect(calls.sort()).toEqual(['candidates', 'jobs']);
  });

  it('is exposed on the hiringService facade', async () => {
    const state = await hiringService.getBoard(fakeReader);
    expect(state).toEqual({ jobs, candidates });
  });
});
