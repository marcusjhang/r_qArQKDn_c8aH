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
  SelectFeedback,
  SelectSource
} from '@/lib/schema/hiring';
import type { SelectUser } from '@/lib/schema/auth';
import { BOARD_TAGS } from './cache';
import type { RatingValue, Status } from './primitives';

export type { Status, RatingValue } from './primitives';

/**
 * A user — an owner / interviewer. Projected from the account row (see
 * lib/schema/auth.ts) so the picklist is the seeded/registered users, never a
 * hardcoded list. Display name/initials are derived in helpers, not stored.
 */
export interface User {
  id: number;
  name: string | null;
  email: string;
}

/**
 * A candidate source (where a candidate came from). Projected from the seeded
 * `sources` table so the options are DB-driven, never a hardcoded list.
 */
export interface Source {
  id: number;
  name: string;
}

/** One interviewer's entry, trimmed to the fields the UI shows. */
export interface Feedback {
  id: number;
  byUser: number;
  rating: RatingValue;
  note: string;
}

/** A candidate plus its embedded feedback (assembled by the relational query). */
export interface Candidate {
  id: number;
  jobId: number;
  name: string;
  stage: string;
  owner: number;
  source: number;
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
  /** The users who can own candidates / leave feedback (seed + sign-ups). */
  users: User[];
  /** The candidate sources available for the source picker (seeded). */
  sources: Source[];
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
type _UserConforms = Conforms<User, Pick<SelectUser, keyof User>>;
type _SourceConforms = Conforms<Source, Pick<SelectSource, keyof Source>>;

/** The data dependency `getBoard` reads from. */
export interface BoardReader {
  loadJobs(): Promise<Job[]>;
  loadCandidates(): Promise<Candidate[]>;
  loadUsers(): Promise<User[]>;
  loadSources(): Promise<Source[]>;
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
      columns: { id: true, name: true, email: true },
      orderBy: (u, { asc }) => [asc(u.name), asc(u.email)]
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
  }
};

/**
 * Read the whole board and return it as UI-shaped DTOs. Reads jobs and
 * candidates concurrently through the injected `reader` (Drizzle-backed by
 * default).
 */
export async function getBoard(
  reader: BoardReader = drizzleReader
): Promise<HiringState> {
  const [jobs, candidates, users, sources] = await Promise.all([
    reader.loadJobs(),
    reader.loadCandidates(),
    reader.loadUsers(),
    reader.loadSources()
  ]);

  return { jobs, candidates, users, sources };
}

/** The hiring facade the app consumes. Group reads here as they are added. */
export const hiringService = {
  getBoard
};
