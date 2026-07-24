import 'server-only';

// The Drizzle-backed `BoardReader` (production default). Each method returns a UI-shaped DTO; `db` is imported lazily so merely importing this module doesn't construct the postgres client or require DATABASE_URL. Reads are intentionally uncached — TanStack Query is the board's single caching layer.

import { DEFAULT_STAGE_WARN_DAYS } from '../primitives';
import type {
  BoardReader,
  Candidate,
  Job,
  SeniorityBand,
  Source,
  User
} from './dtos';

export const drizzleReader: BoardReader = {
  async loadJobs(): Promise<Job[]> {
    const { db } = await import('@/lib/db');
    return db.query.jobs.findMany({
      columns: {
        id: true,
        title: true,
        stages: true,
        traits: true,
        description: true,
        starred: true
      },
      orderBy: (j, { asc }) => [asc(j.position), asc(j.id)]
    });
  },
  async loadCandidates(): Promise<Candidate[]> {
    const { db } = await import('@/lib/db');
    return db.query.candidates.findMany({
      columns: {
        id: true,
        jobId: true,
        name: true,
        stage: true,
        stageEnteredAt: true,
        owner: true,
        source: true,
        yearsExperience: true,
        status: true,
        starred: true,
        linkedinUrl: true,
        githubUrl: true
      },
      with: {
        feedback: {
          columns: {
            id: true,
            byUser: true,
            traitScores: true,
            stage: true,
            note: true
          },
          orderBy: (f, { asc }) => [asc(f.id)]
        }
      },
      orderBy: (c, { asc }) => [asc(c.createdAt), asc(c.id)]
    });
  },
  // The owner/interviewer picklist.
  async loadUsers(): Promise<User[]> {
    const { db } = await import('@/lib/db');
    return db.query.users.findMany({
      columns: { id: true, firstName: true, lastName: true, email: true },
      orderBy: (u, { asc }) => [asc(u.firstName), asc(u.lastName), asc(u.email)]
    });
  },
  // The candidate-source picklist.
  async loadSources(): Promise<Source[]> {
    const { db } = await import('@/lib/db');
    return db.query.sources.findMany({
      columns: { id: true, name: true },
      orderBy: (s, { asc }) => [asc(s.name)]
    });
  },
  // Ordered high-to-low so seniorityFor's first-match scan is correct without a client-side re-sort.
  async loadBands(): Promise<SeniorityBand[]> {
    const { db } = await import('@/lib/db');
    return db.query.seniorityBands.findMany({
      columns: { id: true, label: true, minYears: true },
      orderBy: (b, { desc }) => [desc(b.minYears)]
    });
  },
  // The one universal stage-warn-days threshold; falls back to the default if the pipeline_settings row is somehow missing.
  async loadStageWarnDays(): Promise<number> {
    const { db } = await import('@/lib/db');
    const row = await db.query.pipelineSettings.findFirst({
      columns: { stageWarnDays: true },
      orderBy: (s, { asc }) => [asc(s.id)]
    });
    return row?.stageWarnDays ?? DEFAULT_STAGE_WARN_DAYS;
  }
};
