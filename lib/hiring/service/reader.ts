import 'server-only';

// The Drizzle-backed `BoardReader`: the production read implementation behind
// the service facade. No ORM types cross out of this module — each method
// returns a UI-shaped DTO. `db` is imported lazily so that merely importing this
// module (or the facade) does not construct the postgres client or require
// DATABASE_URL — a unit test that injects a fake reader never touches Postgres.
//
// Each cacheable read is wrapped in `unstable_cache` under a per-entity tag, so
// the board's jobs and candidates are served from the Data Cache instead of
// hitting Postgres on every request. The matching server action revalidates only
// the tag(s) it mutated (see ../actions), so a candidate edit never forces the
// jobs list to be re-queried, and vice-versa. Only this production reader is
// cached — a test-injected `BoardReader` runs uncached and untouched.

import { unstable_cache } from 'next/cache';
import { BOARD_TAGS } from '../cache';
import type { BoardReader, Candidate, Job, SeniorityBand, Source, User } from './dtos';

export const drizzleReader: BoardReader = {
  loadJobs: unstable_cache(
    async (): Promise<Job[]> => {
      const { db } = await import('@/lib/db');
      return db.query.jobs.findMany({
        columns: { id: true, title: true, stages: true, starred: true },
        orderBy: (j, { asc }) => [asc(j.position), asc(j.id)]
      });
    },
    ['board:jobs'],
    { tags: [BOARD_TAGS.jobs] }
  ),
  loadCandidates: unstable_cache(
    async (): Promise<Candidate[]> => {
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
    ['board:candidates'],
    { tags: [BOARD_TAGS.candidates] }
  ),
  // Users are read fresh (uncached): a brand-new sign-up must be selectable as
  // an owner/interviewer on the very next board render, with no tag to
  // invalidate from the registration path.
  loadUsers: async (): Promise<User[]> => {
    const { db } = await import('@/lib/db');
    return db.query.users.findMany({
      columns: { id: true, firstName: true, lastName: true, email: true },
      orderBy: (u, { asc }) => [asc(u.firstName), asc(u.lastName), asc(u.email)]
    });
  },
  // Sources are read fresh (uncached) too, so a newly seeded source is picker-
  // ready on the next render — same rationale as loadUsers.
  loadSources: async (): Promise<Source[]> => {
    const { db } = await import('@/lib/db');
    return db.query.sources.findMany({
      columns: { id: true, name: true },
      orderBy: (s, { asc }) => [asc(s.name)]
    });
  },
  // Bands are read fresh (uncached) so an edit in /settings is reflected on the
  // next board render. Ordered high-to-low so seniorityFor's first-match scan is
  // correct without a client-side re-sort.
  loadBands: async (): Promise<SeniorityBand[]> => {
    const { db } = await import('@/lib/db');
    return db.query.seniorityBands.findMany({
      columns: { id: true, label: true, minYears: true },
      orderBy: (b, { desc }) => [desc(b.minYears)]
    });
  }
};
