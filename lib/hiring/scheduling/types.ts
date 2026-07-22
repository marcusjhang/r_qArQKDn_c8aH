// UI/domain types for interview scheduling, DERIVED from the Drizzle schema
// (single source of truth) via `import type` only — so the schema's runtime
// deps never enter the client bundle, exactly like lib/hiring/types.ts.

import type {
  SelectInterview,
  SelectInterviewPanel,
  SelectInterviewerAvailability,
  SelectAvailabilityException
} from '@/lib/schema';

export type PanelMember = Pick<
  SelectInterviewPanel,
  'id' | 'interviewId' | 'founderId' | 'role' | 'memberStatus'
>;

export type Interview = Pick<
  SelectInterview,
  | 'id'
  | 'candidateId'
  | 'jobId'
  | 'type'
  | 'status'
  | 'startsAt'
  | 'endsAt'
  | 'durationMin'
  | 'bufferMin'
  | 'locationKind'
  | 'locationDetail'
  | 'stageAtBooking'
  | 'createdBy'
  | 'cancelReason'
  | 'createdAt'
  | 'updatedAt'
>;

/** An interview with its panel members embedded (from the relational query). */
export type InterviewWithPanel = Interview & { panel: PanelMember[] };

/** Calendar-facing interview: panel + the display fields the grid needs. */
export type CalendarInterview = InterviewWithPanel & {
  candidateName: string;
  jobTitle: string;
  candidateStage: string;
};

export type Availability = Pick<
  SelectInterviewerAvailability,
  'id' | 'founderId' | 'weekday' | 'startMinute' | 'endMinute'
>;

export type AvailabilityException = Pick<
  SelectAvailabilityException,
  'id' | 'founderId' | 'startsAt' | 'endsAt' | 'kind' | 'note'
>;

/** A bookable slot. Times are ISO-8601 UTC strings for clean serialization. */
export interface Slot {
  startIso: string;
  endIso: string;
  /** How many eligible interviewers are free — used to hint scarcity. */
  freeCount: number;
}

/** A proposed/confirmed panel member (auto-assign output, drawer input). */
export interface PanelPick {
  founderId: string;
  role: import('./../primitives').PanelRole;
}
