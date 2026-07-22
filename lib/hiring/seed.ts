// Seed / sample data (Decision 8), consumed by the DB seeder (`db/seed.ts`).
//
// Three realistic roles with ~12 candidates spread across stages, mixed
// ratings, statuses, sources, and owners — including one rejected and one
// hired candidate to demonstrate the terminal-state filter.
//
// Jobs are keyed by a temporary `slug`; the seeder inserts jobs first and
// resolves each candidate's `job` slug to the generated serial id.

import { DEFAULT_STAGES } from './config';
import type {
  InterviewType,
  PanelRole,
  RatingValue,
  ScheduleStatus,
  Status
} from './types';

export interface SeedJob {
  slug: string;
  title: string;
  stages: string[];
}

export interface SeedFeedback {
  by: string;
  v: RatingValue;
  note: string;
}

export interface SeedCandidate {
  job: string; // job slug
  name: string;
  stage: string;
  owner: string;
  source: string;
  status: Status;
  starred?: boolean;
  feedback: SeedFeedback[];
  /** Whole days ago the candidate entered its current stage (stale warning). */
  daysInStage?: number;
  /** Touchpoint state. Omit to leave the candidate unscheduled. */
  scheduleStatus?: ScheduleStatus;
  /** Booked touchpoint relative to seed time, in days (negative = overdue). */
  scheduledInDays?: number;
  /** Days ago the touchpoint was marked completed (awaiting-decision nudge). */
  completedDaysAgo?: number;
}

export const SEED_JOBS: SeedJob[] = [
  { slug: 'eng', title: 'Founding Engineer', stages: [...DEFAULT_STAGES] },
  { slug: 'design', title: 'Product Designer', stages: [...DEFAULT_STAGES] },
  { slug: 'gtm', title: 'GTM Lead', stages: [...DEFAULT_STAGES] }
];

export const SEED_CANDIDATES: SeedCandidate[] = [
  // Founding Engineer
  {
    job: 'eng',
    name: 'Ava Chen',
    stage: 'Screen',
    owner: 'bo',
    source: 'LinkedIn',
    status: 'active',
    starred: true,
    daysInStage: 5,
    feedback: [
      { by: 'bc', v: 3, note: 'Solid CS fundamentals, clean take-home.' },
      { by: 'hl', v: 4, note: 'Excellent systems design — would move fast.' }
    ]
  },
  {
    job: 'eng',
    name: 'Marcus Webb',
    stage: 'Applied',
    owner: 'bc',
    source: 'Referral',
    status: 'active',
    daysInStage: 4,
    feedback: []
  },
  {
    job: 'eng',
    name: 'Priya Nair',
    stage: 'Interview',
    owner: 'hl',
    source: 'YC',
    status: 'active',
    starred: true,
    daysInStage: 1,
    scheduleStatus: 'scheduled',
    scheduledInDays: 1,
    feedback: [
      { by: 'bo', v: 4, note: 'Sharp, great product instincts.' },
      { by: 'bc', v: 3, note: 'Strong, minor gaps in distributed systems.' }
    ]
  },
  {
    job: 'eng',
    name: 'Tom Alvarez',
    stage: 'Applied',
    owner: 'bo',
    source: 'Inbound',
    status: 'active',
    feedback: []
  },
  {
    job: 'eng',
    name: 'Sofia Kim',
    stage: 'Offer',
    owner: 'bc',
    source: 'Referral',
    status: 'active',
    feedback: [
      { by: 'bo', v: 4, note: 'Best onsite so far.' },
      { by: 'hl', v: 4, note: 'Ship it — strong hire.' },
      { by: 'bc', v: 3, note: 'Yes, aligned on comp.' }
    ]
  },
  {
    job: 'eng',
    name: 'Dan Osei',
    stage: 'Screen',
    owner: 'hl',
    source: 'LinkedIn',
    status: 'rejected',
    feedback: [
      { by: 'hl', v: 2, note: 'Experience did not match the role level.' }
    ]
  },
  {
    job: 'eng',
    name: 'Lena Vogt',
    stage: 'Hired',
    owner: 'bo',
    source: 'Referral',
    status: 'hired',
    feedback: [
      { by: 'bo', v: 4, note: 'Accepted — starting next month.' },
      { by: 'bc', v: 4, note: 'Great addition.' }
    ]
  },
  // Product Designer
  {
    job: 'design',
    name: 'Ravi Shah',
    stage: 'Applied',
    owner: 'bc',
    source: 'Otta',
    status: 'active',
    feedback: []
  },
  {
    job: 'design',
    name: 'Mia Torres',
    stage: 'Interview',
    owner: 'hl',
    source: 'LinkedIn',
    status: 'active',
    daysInStage: 4,
    scheduleStatus: 'completed',
    scheduledInDays: -4,
    completedDaysAgo: 3,
    feedback: [
      { by: 'hl', v: 3, note: 'Strong portfolio, thoughtful about systems.' }
    ]
  },
  {
    job: 'design',
    name: 'Noah Park',
    stage: 'Screen',
    owner: 'bo',
    source: 'Referral',
    status: 'onhold',
    feedback: [
      { by: 'bo', v: 3, note: 'Promising — paused while we align on level.' }
    ]
  },
  // GTM Lead
  {
    job: 'gtm',
    name: 'Ines Costa',
    stage: 'Applied',
    owner: 'bc',
    source: 'Inbound',
    status: 'active',
    feedback: []
  },
  {
    job: 'gtm',
    name: 'Jack Reed',
    stage: 'Interview',
    owner: 'hl',
    source: 'LinkedIn',
    status: 'active',
    daysInStage: 2,
    scheduleStatus: 'scheduled',
    scheduledInDays: -1,
    feedback: [
      { by: 'hl', v: 4, note: 'Rare combo of GTM + technical depth.' }
    ]
  }
];

/* ---------- Interview scheduling seed ---------- */

export interface SeedInterview {
  candidate: string; // candidate name
  type: InterviewType;
  status: 'scheduled' | 'completed';
  /** Days from seed time (COMPANY_TZ), negative = past. */
  startOffsetDays: number;
  /** Local start hour (COMPANY_TZ). */
  hour: number;
  panel: { founderId: string; role: PanelRole }[];
}

// A few interviews wired to the seed candidates so the calendar and the
// projected board chips line up out of the box. Ava is left unscheduled so the
// drawer's live booking flow can be demoed.
export const SEED_INTERVIEWS: SeedInterview[] = [
  {
    candidate: 'Priya Nair',
    type: 'interview',
    status: 'scheduled',
    startOffsetDays: 1,
    hour: 14,
    panel: [
      { founderId: 'bo', role: 'lead' },
      { founderId: 'bc', role: 'interviewer' }
    ]
  },
  {
    candidate: 'Jack Reed',
    type: 'interview',
    status: 'scheduled',
    startOffsetDays: -1,
    hour: 11,
    panel: [{ founderId: 'hl', role: 'lead' }]
  },
  {
    candidate: 'Mia Torres',
    type: 'interview',
    status: 'completed',
    startOffsetDays: -3,
    hour: 15,
    panel: [
      { founderId: 'hl', role: 'lead' },
      { founderId: 'bo', role: 'interviewer' }
    ]
  }
];
