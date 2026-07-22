import { describe, it, expect } from 'vitest';
import { getBoardData, type BoardReader } from '@/lib/hiring/queries';
import type { Candidate, Job } from '@/lib/hiring/types';

// Because getBoardData reads through an injected BoardReader (rather than the
// db singleton), it can be exercised with in-memory rows — no database, no
// mocking of Drizzle's query builder.
describe('getBoardData', () => {
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
    const state = await getBoardData(fakeReader);
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
    await getBoardData(reader);
    expect(calls.sort()).toEqual(['candidates', 'jobs']);
  });
});
