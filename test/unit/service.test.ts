import { describe, it, expect } from 'vitest';
import { getBoard, hiringService, type BoardReader } from '@/lib/hiring/core/service';
import type {
  Candidate,
  Job,
  User,
  Source,
  SeniorityBand
} from '@/lib/hiring/model/types';

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
    { id: 1, firstName: 'Ben', lastName: 'Ong', email: 'benong@lightsprint.ai' }
  ];
  const sources: Source[] = [{ id: 5, name: 'Referral' }];
  const bands: SeniorityBand[] = [
    { id: 1, label: 'Senior', minYears: 5 },
    { id: 2, label: 'Junior', minYears: 0 }
  ];
  const candidates: Candidate[] = [
    {
      id: 10,
      jobId: 1,
      name: 'Ada',
      stage: 'Applied',
      owner: 1,
      source: 5,
      yearsExperience: null,
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
    loadSources: async () => sources,
    loadBands: async () => bands
  };

  it('composes the reader results into a HiringState payload', async () => {
    const state = await getBoard(fakeReader);
    expect(state).toEqual({ jobs, candidates, users, sources, bands });
  });

  it('reads jobs, candidates, users, sources and bands concurrently from the reader', async () => {
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
      },
      loadBands: async () => {
        calls.push('bands');
        return bands;
      }
    };
    await getBoard(reader);
    expect(calls.sort()).toEqual([
      'bands',
      'candidates',
      'jobs',
      'sources',
      'users'
    ]);
  });

  it('is exposed on the hiringService facade', async () => {
    const state = await hiringService.getBoard(fakeReader);
    expect(state).toEqual({ jobs, candidates, users, sources, bands });
  });
});
