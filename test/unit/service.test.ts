import { describe, it, expect } from 'vitest';
import { getBoard, hiringService, type BoardReader } from '@/lib/hiring/service';
import type {
  Candidate,
  Job,
  User,
  Source,
  SeniorityBand
} from '@/lib/hiring/types';

// getBoard reads through an injected BoardReader, so it runs against in-memory
// rows — no database, no mocking of Drizzle's query builder.
describe('getBoard', () => {
  const jobs: Job[] = [
    {
      id: 1,
      title: 'Founding Engineer',
      stages: ['Applied', 'Hired'],
      traits: ['Technical depth'],
      description: null,
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
  const stageWarnDays = 5;
  const candidates: Candidate[] = [
    {
      id: 10,
      jobId: 1,
      name: 'Ada',
      stage: 'Applied',
      stageEnteredAt: new Date(0),
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
    loadBands: async () => bands,
    loadStageWarnDays: async () => stageWarnDays
  };

  it('composes the reader results into a HiringState payload', async () => {
    const state = await getBoard(fakeReader);
    expect(state).toEqual({
      jobs,
      candidates,
      users,
      sources,
      bands,
      stageWarnDays
    });
  });

  it('reads jobs, candidates, users, sources, bands and the stage-warn threshold concurrently from the reader', async () => {
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
      },
      loadStageWarnDays: async () => {
        calls.push('stageWarnDays');
        return stageWarnDays;
      }
    };
    await getBoard(reader);
    expect(calls.sort()).toEqual([
      'bands',
      'candidates',
      'jobs',
      'sources',
      'stageWarnDays',
      'users'
    ]);
  });

  it('is exposed on the hiringService facade', async () => {
    const state = await hiringService.getBoard(fakeReader);
    expect(state).toEqual({
      jobs,
      candidates,
      users,
      sources,
      bands,
      stageWarnDays
    });
  });
});
