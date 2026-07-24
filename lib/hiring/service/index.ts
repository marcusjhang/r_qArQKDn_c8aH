import 'server-only';

// Hiring service facade: the single read boundary for the board. Composes `getBoard` and re-exports the DTO contract; the read runs against an injectable `BoardReader` (Drizzle by default, a fake in tests) so it needs no live DB.

import type { BoardReader, HiringState } from './dtos';
import { drizzleReader } from './reader';

export type {
  Status,
  RatingValue,
  TraitScores,
  User,
  Source,
  SeniorityBand,
  Feedback,
  Candidate,
  Job,
  HiringState,
  BoardReader
} from './dtos';

/** Read the whole board as UI-shaped DTOs, loading each part concurrently through the injected `reader`. */
export async function getBoard(
  reader: BoardReader = drizzleReader
): Promise<HiringState> {
  const [jobs, candidates, users, sources, bands, stageWarnDays] =
    await Promise.all([
      reader.loadJobs(),
      reader.loadCandidates(),
      reader.loadUsers(),
      reader.loadSources(),
      reader.loadBands(),
      reader.loadStageWarnDays()
    ]);

  return { jobs, candidates, users, sources, bands, stageWarnDays };
}

/** The hiring facade the app consumes. Group reads here as they are added. */
export const hiringService = {
  getBoard
};
