import 'server-only';

// Server-side read of the whole board. Drizzle's relational query returns
// candidates with their feedback already nested, and `columns` trims each row
// to exactly the UI fields — so the result IS `HiringState` with no casts, no
// field renames, and no manual grouping.

import { db } from '@/lib/db';
import type { HiringState } from './types';

export async function getBoardData(): Promise<HiringState> {
  const [jobs, candidates] = await Promise.all([
    db.query.jobs.findMany({
      columns: { id: true, title: true, stages: true, starred: true },
      orderBy: (j, { asc }) => [asc(j.position), asc(j.id)]
    }),
    db.query.candidates.findMany({
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
    })
  ]);

  return { jobs, candidates };
}
