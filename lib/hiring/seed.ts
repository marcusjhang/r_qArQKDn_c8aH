// Seed / sample data (Decision 8), consumed by the DB seeder (`db/seed.ts`).
//
// Three realistic roles with ~12 candidates spread across stages, mixed
// ratings, statuses, sources, and owners — including one rejected and one
// hired candidate to demonstrate the terminal-state filter.
//
// Jobs are keyed by a temporary `slug`; the seeder inserts jobs first and
// resolves each candidate's `job` slug to the generated serial id. Owners and
// feedback authors are referenced by the user's EMAIL (a stable, readable key);
// the seeder resolves each email to the seeded account's serial id.

import { DEFAULT_STAGES } from './config';
import type { RatingValue, Status } from './types';

// The seeded users, referenced by email so the demo assignments read clearly
// and stay in lockstep with the accounts created in db/seed.ts.
const SEED_USER_EMAILS = {
  marcus: 'marcusajh0802@gmail.com',
  benOng: 'benong@lightsprint.ai',
  benChan: 'benchan@lightsprint.ai',
  hengHongLee: 'henghonglee@lightsprint.ai'
} as const;

const { marcus, benOng, benChan, hengHongLee } = SEED_USER_EMAILS;

// Canonical candidate sources, seeded into the `sources` table. The dropdown
// options are read from that table (not this list), so this is only the seed.
export const SEED_SOURCES: string[] = [
  'LinkedIn',
  'Referral',
  'YC',
  'Inbound',
  'Otta'
];

export interface SeedJob {
  slug: string;
  title: string;
  stages: string[];
}

export interface SeedFeedback {
  /** Interviewer's email (resolved to a user id by the seeder). */
  by: string;
  v: RatingValue;
  note: string;
}

export interface SeedCandidate {
  job: string; // job slug
  name: string;
  stage: string;
  /** Owner's email (resolved to a user id by the seeder). */
  owner: string;
  source: string;
  status: Status;
  starred?: boolean;
  feedback: SeedFeedback[];
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
    owner: benOng,
    source: 'LinkedIn',
    status: 'active',
    starred: true,
    feedback: [
      { by: benChan, v: 3, note: 'Solid CS fundamentals, clean take-home.' },
      { by: hengHongLee, v: 4, note: 'Excellent systems design — would move fast.' }
    ]
  },
  {
    job: 'eng',
    name: 'Marcus Webb',
    stage: 'Applied',
    owner: benChan,
    source: 'Referral',
    status: 'active',
    feedback: []
  },
  {
    job: 'eng',
    name: 'Priya Nair',
    stage: 'Interview',
    owner: hengHongLee,
    source: 'YC',
    status: 'active',
    starred: true,
    feedback: [
      { by: benOng, v: 4, note: 'Sharp, great product instincts.' },
      { by: benChan, v: 3, note: 'Strong, minor gaps in distributed systems.' }
    ]
  },
  {
    job: 'eng',
    name: 'Tom Alvarez',
    stage: 'Applied',
    owner: marcus,
    source: 'Inbound',
    status: 'active',
    feedback: []
  },
  {
    job: 'eng',
    name: 'Sofia Kim',
    stage: 'Offer',
    owner: benChan,
    source: 'Referral',
    status: 'active',
    feedback: [
      { by: benOng, v: 4, note: 'Best onsite so far.' },
      { by: hengHongLee, v: 4, note: 'Ship it — strong hire.' },
      { by: benChan, v: 3, note: 'Yes, aligned on comp.' },
      { by: marcus, v: 4, note: 'Aligned — sending the offer.' }
    ]
  },
  {
    job: 'eng',
    name: 'Dan Osei',
    stage: 'Screen',
    owner: hengHongLee,
    source: 'LinkedIn',
    status: 'rejected',
    feedback: [
      { by: hengHongLee, v: 2, note: 'Experience did not match the role level.' }
    ]
  },
  {
    job: 'eng',
    name: 'Lena Vogt',
    stage: 'Hired',
    owner: benOng,
    source: 'Referral',
    status: 'hired',
    feedback: [
      { by: benOng, v: 4, note: 'Accepted — starting next month.' },
      { by: benChan, v: 4, note: 'Great addition.' }
    ]
  },
  // Product Designer
  {
    job: 'design',
    name: 'Ravi Shah',
    stage: 'Applied',
    owner: benChan,
    source: 'Otta',
    status: 'active',
    feedback: []
  },
  {
    job: 'design',
    name: 'Mia Torres',
    stage: 'Interview',
    owner: hengHongLee,
    source: 'LinkedIn',
    status: 'active',
    feedback: [
      { by: hengHongLee, v: 3, note: 'Strong portfolio, thoughtful about systems.' }
    ]
  },
  {
    job: 'design',
    name: 'Noah Park',
    stage: 'Screen',
    owner: benOng,
    source: 'Referral',
    status: 'onhold',
    feedback: [
      { by: benOng, v: 3, note: 'Promising — paused while we align on level.' }
    ]
  },
  // GTM Lead
  {
    job: 'gtm',
    name: 'Ines Costa',
    stage: 'Applied',
    owner: benChan,
    source: 'Inbound',
    status: 'active',
    feedback: []
  },
  {
    job: 'gtm',
    name: 'Jack Reed',
    stage: 'Interview',
    owner: hengHongLee,
    source: 'LinkedIn',
    status: 'active',
    feedback: [
      { by: hengHongLee, v: 4, note: 'Rare combo of GTM + technical depth.' }
    ]
  }
];
