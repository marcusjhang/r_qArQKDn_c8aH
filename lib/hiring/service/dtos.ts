// The UI-shaped DTO contract for the hiring board.
//
// These interfaces (`Job`, `Candidate`, `Feedback`, `HiringState`, …) are the
// single place the UI contract is stated — names are the UI's, not the
// database's — but each carries a compile-time conformance guard (see
// `_conformance` below) that fails the build if it ever drifts from the Drizzle
// row it projects. So we get an explicit, hand-owned contract *and* the
// never-drifts guarantee of a derived type. Pure types (type-only imports), so
// this module is safe to pull into the client bundle via `types.ts`.

import type {
  SelectJob,
  SelectCandidate,
  SelectFeedback,
  SelectSource,
  SelectSeniorityBand
} from '@/lib/schema/hiring';
import type { SelectUser } from '@/lib/schema/auth';
import type { Status, TraitScores } from '../primitives';

export type { Status, RatingValue, TraitScores } from '../primitives';

/**
 * A user — an owner / interviewer. Projected from the account row (see
 * lib/schema/auth.ts) so the picklist is the seeded/registered users, never a
 * hardcoded list. Display name/initials are derived in helpers, not stored.
 */
export interface User {
  id: number;
  firstName: string | null;
  lastName: string | null;
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

/**
 * A seniority band (the configurable years-of-experience → label mapping).
 * Projected from the seeded `seniority_bands` table so the tiers are DB-driven
 * and editable in /settings, never a hardcoded list.
 */
export interface SeniorityBand {
  id: number;
  label: string;
  minYears: number;
}

/** One interviewer's entry, trimmed to the fields the UI shows. */
export interface Feedback {
  id: number;
  byUser: number;
  /** Per-trait scores (1–4) keyed by the job's trait name. */
  traitScores: TraitScores;
  /** The candidate's stage when this entry was left ("given at"). */
  stage: string;
  note: string;
}

/** A candidate plus its embedded feedback (assembled by the relational query). */
export interface Candidate {
  id: number;
  jobId: number;
  name: string;
  stage: string;
  /** When the candidate entered its current stage (drives the overdue warning). */
  stageEnteredAt: Date;
  owner: number;
  source: number;
  yearsExperience: number | null;
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
  /** Ordered trait list — order is the ranking that weights the score. */
  traits: string[];
  /** Pasteable job description (JD); feeds the AI trait suggester. */
  description: string | null;
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
  /** The configurable seniority bands (years-of-experience → label mapping). */
  bands: SeniorityBand[];
  /** The one universal "warn after N days in a stage" threshold (see
   *  pipeline_settings), applied to every stage's overdue check. */
  stageWarnDays: number;
}

/** The data dependency `getBoard` reads from (Drizzle-backed in production, an
 * in-memory fake in tests). */
export interface BoardReader {
  loadJobs(): Promise<Job[]>;
  loadCandidates(): Promise<Candidate[]>;
  loadUsers(): Promise<User[]>;
  loadSources(): Promise<Source[]>;
  loadBands(): Promise<SeniorityBand[]>;
  /** The single universal stage-warn-days threshold (from pipeline_settings). */
  loadStageWarnDays(): Promise<number>;
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
type _SeniorityBandConforms = Conforms<
  SeniorityBand,
  Pick<SelectSeniorityBand, keyof SeniorityBand>
>;
