import { describe, it, expect } from 'vitest';
import { getBoard, hiringService, type BoardReader } from '@/lib/hiring/service';
import type { Candidate, Job, User, Source } from '@/lib/hiring/types';

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
  const users: User[] = [
    { id: 1, name: 'Ben Ong', email: 'benong@lightsprint.ai' }
  ];
  const sources: Source[] = [{ id: 5, name: 'Referral' }];
  const candidates: Candidate[] = [
    {
      id: 10,
      jobId: 1,
      name: 'Ada',
      stage: 'Applied',
      owner: 1,
      source: 5,
      status: 'active',
      starred: false,
      linkedinUrl: null,
      githubUrl: null,
      feedback: []
    }
  ];

  const fakeReader: BoardReader = {
    loadJobs: async () => jobs,
    loadCandidates: async () => candidates,
    loadUsers: async () => users,
    loadSources: async () => sources
  };

  it('composes the reader results into a HiringState payload', async () => {
    const state = await getBoard(fakeReader);
    expect(state).toEqual({ jobs, candidates, users, sources });
  });

  it('reads jobs, candidates, users and sources concurrently from the reader', async () => {
    const calls: string[] = [];
    const reader: BoardReader = {
      loadJobs: async () => {
        calls.push('jobs');
        return jobs;
      },
      loadCandidates: async () => {
        calls.push('candidates');
        return candidates;
      },
      loadUsers: async () => {
        calls.push('users');
        return users;
      },
      loadSources: async () => {
        calls.push('sources');
        return sources;
      }
    };
    await getBoard(reader);
    expect(calls.sort()).toEqual(['candidates', 'jobs', 'sources', 'users']);
  });

  it('is exposed on the hiringService facade', async () => {
    const state = await hiringService.getBoard(fakeReader);
    expect(state).toEqual({ jobs, candidates, users, sources });
  });
});
