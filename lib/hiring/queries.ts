import 'server-only';

// Server-side read of the whole board. Drizzle's relational query returns
// candidates with their feedback already nested, and `columns` trims each row
// to exactly the UI fields — so the result IS `HiringState` with no casts, no
// field renames, and no manual grouping.
//
// The read is expressed against a `BoardReader` dependency rather than the
// `db` singleton directly. Production passes the Drizzle-backed reader (the
// default); tests can pass a fake reader with in-memory rows to exercise
// `getBoardData`'s composition without a live database or `DATABASE_URL`.

import type { Candidate, HiringState, Job } from './types';

/** The data dependency `getBoardData` reads from. */
export interface BoardReader {
  loadJobs(): Promise<Job[]>;
  loadCandidates(): Promise<Candidate[]>;
}

// Drizzle-backed reader. `db` is imported lazily so that merely importing this
// module (e.g. from a unit test that injects a fake reader) does not construct
// the postgres client or require DATABASE_URL to be set.
const drizzleReader: BoardReader = {
  async loadJobs() {
    const { db } = await import('@/lib/db');
    return db.query.jobs.findMany({
      columns: { id: true, title: true, stages: true, starred: true },
      orderBy: (j, { asc }) => [asc(j.position), asc(j.id)]
    });
  },
  async loadCandidates() {
    const { db } = await import('@/lib/db');
    return db.query.candidates.findMany({
      columns: {
        id: true,
        jobId: true,
        name: true,
        stage: true,
        owner: true,
        source: true,
        status: true,
        starred: true
      },
      with: {
        feedback: {
          columns: { id: true, byFounder: true, rating: true, note: true },
          orderBy: (f, { asc }) => [asc(f.id)]
        }
      },
      orderBy: (c, { asc }) => [asc(c.createdAt), asc(c.id)]
    });
  }
};

export async function getBoardData(
  reader: BoardReader = drizzleReader
): Promise<HiringState> {
  const [jobs, candidates] = await Promise.all([
    reader.loadJobs(),
    reader.loadCandidates()
  ]);

  return { jobs, candidates };
}
