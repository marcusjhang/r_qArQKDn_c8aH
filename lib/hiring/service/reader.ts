import 'server-only';

// The Drizzle-backed `BoardReader`: the production read implementation behind
// the service facade. No ORM types cross out of this module — each method
// returns a UI-shaped DTO. `db` is imported lazily so that merely importing this
// module (or the facade) does not construct the postgres client or require
// DATABASE_URL — a unit test that injects a fake reader never touches Postgres.
//
// These reads are intentionally uncached: TanStack Query is the single caching
// layer for the board. The board page is `force-dynamic`, so each server render
// reads fresh rows straight from Postgres and seeds the client's query cache via
// `initialData`; the client then serves every subsequent read from that
// TanStack Query cache and only re-reads (through the `fetchBoard` server action)
// when it explicitly invalidates on a failed optimistic write. There is no
// hand-rolled server Data Cache or tag-invalidation to keep in sync.

import type { BoardReader, Candidate, Job, SeniorityBand, Source, User } from './dtos';

export const drizzleReader: BoardReader = {
  async loadJobs(): Promise<Job[]> {
    const { db } = await import('@/lib/db');
    return db.query.jobs.findMany({
      columns: { id: true, title: true, stages: true, starred: true },
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
          columns: { id: true, byUser: true, rating: true, note: true },
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
  // The seniority bands, ordered high-to-low so seniorityFor's first-match scan
  // is correct without a client-side re-sort.
  async loadBands(): Promise<SeniorityBand[]> {
    const { db } = await import('@/lib/db');
    return db.query.seniorityBands.findMany({
      columns: { id: true, label: true, minYears: true },
      orderBy: (b, { desc }) => [desc(b.minYears)]
    });
  }
};
