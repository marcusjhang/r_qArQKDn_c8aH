import 'server-only';

// Hiring service facade.
//
// This is the single boundary the app/UI crosses to read the hiring board. It
// composes the read (`getBoard`) and re-exports the DTO contract, so callers
// import everything read-side from `@/lib/hiring/service`. The pieces live in
// sibling modules:
//
//   - ./dtos   — the UI-shaped DTO interfaces, the `BoardReader` contract, and
//                the compile-time conformance guards that keep the DTOs from
//                drifting from the Drizzle rows they project.
//   - ./reader — the Drizzle-backed `BoardReader` (the production default).
//
// The read is expressed against a `BoardReader` rather than the `db` singleton
// directly. Production passes the Drizzle-backed reader (the default); tests
// pass a fake reader with in-memory rows to exercise `getBoard`'s composition
// without a live database or `DATABASE_URL`.

import type { BoardReader, HiringState } from './dtos';
import { drizzleReader } from './reader';

export type {
  Status,
  RatingValue,
  User,
  Source,
  SeniorityBand,
  StageSla,
  Feedback,
  Candidate,
  Job,
  HiringState,
  BoardReader
} from './dtos';

/**
 * Read the whole board and return it as UI-shaped DTOs. Reads jobs, candidates,
 * users, sources, and bands concurrently through the injected `reader`
 * (Drizzle-backed by default).
 */
export async function getBoard(
  reader: BoardReader = drizzleReader
): Promise<HiringState> {
  const [jobs, candidates, users, sources, bands, stageSlas] =
    await Promise.all([
      reader.loadJobs(),
      reader.loadCandidates(),
      reader.loadUsers(),
      reader.loadSources(),
      reader.loadBands(),
      reader.loadStageSlas()
    ]);

  return { jobs, candidates, users, sources, bands, stageSlas };
}

/** The hiring facade the app consumes. Group reads here as they are added. */
export const hiringService = {
  getBoard
};
