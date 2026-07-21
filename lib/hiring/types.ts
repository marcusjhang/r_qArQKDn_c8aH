// UI/domain types for the Hiring Pipeline Tracker.
//
// These are DERIVED from the Drizzle schema (the single source of truth) — no
// field types are authored here, so they cannot drift from the database. Only
// `import type` is used, so the schema (and its drizzle/postgres runtime deps)
// never enter the client bundle.

import type {
  SelectJob,
  SelectCandidate,
  SelectFeedback
} from '@/lib/schema';

export type { Status, RatingValue } from './primitives';

export interface Founder {
  id: string;
  name: string;
  initials: string;
}

/** One interviewer's entry, trimmed to the fields the UI shows. */
export type Feedback = Pick<
  SelectFeedback,
  'id' | 'byFounder' | 'rating' | 'note'
>;

/** A candidate plus its embedded feedback (assembled by the relational query). */
export type Candidate = Pick<
  SelectCandidate,
  'id' | 'jobId' | 'name' | 'stage' | 'owner' | 'source' | 'status'
> & {
  feedback: Feedback[];
};

export type Job = Pick<SelectJob, 'id' | 'title' | 'stages'>;

/** The full board payload the server hands to the client. */
export interface HiringState {
  jobs: Job[];
  candidates: Candidate[];
}
