import 'server-only';

// Hiring service facade.
//
// This is the single boundary the app/UI crosses to read the hiring board. It
// owns two things:
//
//   1. The UI-shaped DTO interfaces (`Job`, `Candidate`, `Feedback`,
//      `HiringState`). These are authored explicitly — the UI contract is
//      stated in one place and names are the UI's, not the database's — but
//      each carries a compile-time conformance guard (see `_conformance`
//      below) that fails the build if it ever drifts from the Drizzle row it
//      projects. So we get an explicit, hand-owned contract *and* the
//      never-drifts guarantee of a derived type.
//
//   2. The `getBoard` fetch method, which reads through a `BoardReader`
//      dependency and hands back a `HiringState` DTO — no Drizzle/ORM types
//      cross this line. Drizzle's relational query returns candidates with
//      their feedback already nested, and `columns` trims each row to exactly
//      the DTO fields, so the projection IS the DTO with no casts or renames.
//
// The read is expressed against a `BoardReader` rather than the `db` singleton
// directly. Production passes the Drizzle-backed reader (the default); tests
// pass a fake reader with in-memory rows to exercise `getBoard`'s composition
// without a live database or `DATABASE_URL`.

import { unstable_cache } from 'next/cache';
import type {
  SelectJob,
  SelectCandidate,
  SelectFeedback
} from '@/lib/schema/hiring';
import { BOARD_TAGS } from './cache';
import type { RatingValue, Status } from './primitives';

export type { Status, RatingValue } from './primitives';

/** An owner / interviewer. Pure domain concept, not a database row. */
export interface Founder {
  id: string;
  name: string;
  initials: string;
}

/** One interviewer's entry, trimmed to the fields the UI shows. */
export interface Feedback {
  id: number;
  byFounder: string;
  rating: RatingValue;
  note: string;
}

/** A candidate plus its embedded feedback (assembled by the relational query). */
export interface Candidate {
  id: number;
  jobId: number;
  name: string;
  stage: string;
  owner: string;
  source: string;
  status: Status;
  starred: boolean;
  linkedinUrl: string | null;
  githubUrl: string | null;
  feedback: Feedback[];
}

/** A job, trimmed to the fields the board renders. */
export interface Job {
  id: number;
  title: string;
  stages: string[];
  starred: boolean;
}

/** The full board payload the server hands to the client. */
export interface HiringState {
  jobs: Job[];
  candidates: Candidate[];
}

// Compile-time guard: every DTO must stay a faithful projection of its Drizzle
// row (same field names, assignable types). If a column is renamed, retyped, or
// dropped in lib/schema/hiring.ts, one of these assignments stops type-checking
// and `bun run typecheck` fails — so the DTOs can never silently drift from the
// schema. Type-only, erased at build (no runtime cost, client-bundle safe).
type Conforms<Dto, Row extends Dto> = Row;
type _JobConforms = Conforms<Job, Pick<SelectJob, keyof Job>>;
type _CandidateConforms = Conforms<
  Omit<Candidate, 'feedback'>,
  Pick<SelectCandidate, keyof Omit<Candidate, 'feedback'>>
>;
type _FeedbackConforms = Conforms<
  Feedback,
  Pick<SelectFeedback, keyof Feedback>
>;

/** The data dependency `getBoard` reads from. */
export interface BoardReader {
  loadJobs(): Promise<Job[]>;
  loadCandidates(): Promise<Candidate[]>;
}

// Drizzle-backed reader. `db` is imported lazily so that merely importing this
// module (e.g. from a unit test that injects a fake reader) does not construct
// the postgres client or require DATABASE_URL to be set.
//
// Each read is wrapped in `unstable_cache` under a per-entity tag, so the
// board's jobs and candidates are served from the Data Cache instead of hitting
// Postgres on every request. The matching server action revalidates only the
// tag(s) it mutated (see `actions.ts`), so a candidate edit never forces the
// jobs list to be re-queried, and vice-versa. Only this production reader is
// cached — a test-injected `BoardReader` runs uncached and untouched.
const drizzleReader: BoardReader = {
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
          status: true,
          starred: true,
          linkedinUrl: true,
          githubUrl: true
        },
        with: {
          feedback: {
            columns: { id: true, byFounder: true, rating: true, note: true },
            orderBy: (f, { asc }) => [asc(f.id)]
          }
        },
        orderBy: (c, { asc }) => [asc(c.createdAt), asc(c.id)]
      });
    },
    ['board:candidates'],
    { tags: [BOARD_TAGS.candidates] }
  )
};

/**
 * Read the whole board and return it as UI-shaped DTOs. Reads jobs and
 * candidates concurrently through the injected `reader` (Drizzle-backed by
 * default).
 */
export async function getBoard(
  reader: BoardReader = drizzleReader
): Promise<HiringState> {
  const [jobs, candidates] = await Promise.all([
    reader.loadJobs(),
    reader.loadCandidates()
  ]);

  return { jobs, candidates };
}

/** The hiring facade the app consumes. Group reads here as they are added. */
export const hiringService = {
  getBoard
};
