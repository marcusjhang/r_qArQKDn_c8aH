// Seed / sample data (Decision 8), consumed by the DB seeder (`db/seed.ts`).
//
// Three realistic roles with ~12 candidates spread across stages, mixed
// trait scores, statuses, sources, and owners — including one rejected and one
// hired candidate to demonstrate the terminal-state filter.
//
// Jobs are keyed by a temporary `slug`; the seeder inserts jobs first and
// resolves each candidate's `job` slug to the generated serial id. Owners and
// feedback authors are referenced by the user's EMAIL (a stable, readable key);
// the seeder resolves each email to the seeded account's serial id.

import { DEFAULT_STAGES, DEFAULT_TRAITS, SENIORITY_BANDS } from './config';
import type { Status, TraitScores } from './types';

/** Default seniority bands seeded into the (editable) seniority_bands table. */
export const SEED_SENIORITY_BANDS = SENIORITY_BANDS;

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
  /** Ordered trait list — order is the ranking that weights the score. */
  traits: string[];
  description: string;
}

interface SeedFeedback {
  /** Interviewer's email (resolved to a user id by the seeder). */
  by: string;
  note: string;
  /** Per-trait scores (1–4) keyed by the job's trait name. */
  traits?: TraitScores;
}

export interface SeedCandidate {
  job: string; // job slug
  name: string;
  stage: string;
  /** Owner's email (resolved to a user id by the seeder). */
  owner: string;
  source: string;
  // Years of experience (seniority proxy); null = unspecified.
  yearsExperience: number | null;
  status: Status;
  starred?: boolean;
  // Optional profile links, so the drawer's profile section demos on a fresh
  // seed (omitted = NULL).
  linkedinUrl?: string;
  githubUrl?: string;
  // Optional: how many days ago the candidate entered its current stage. The
  // seeder backdates stage_entered_at by this much so the demo shows a mix of
  // fresh and stalled applicants (some past the universal warn threshold).
  // Omitted = entered "now" (the column default).
  daysInStage?: number;
  feedback: SeedFeedback[];
}

interface SeedMessage {
  /** Candidate name (resolved to the candidate id by the seeder). */
  candidate: string;
  /** Author's email (resolved to a user id by the seeder). */
  by: string;
  /**
   * Message body. To seed an @-mention notification, include the tagged user's
   * display name as an `@Display Name` token here AND list their email in
   * `mentions` — the seeder inserts the mention row that drives the inbox.
   */
  body: string;
  /** Emails to @-mention (a mention row is inserted per user). */
  mentions?: string[];
  /** Whether the mention notifications are already read (default false). */
  read?: boolean;
  /** Days ago the message was posted (backdates created_at; omitted = now). */
  daysAgo?: number;
}

export const SEED_JOBS: SeedJob[] = [
  {
    slug: 'eng',
    title: 'Founding Engineer',
    stages: [...DEFAULT_STAGES],
    traits: ['Technical depth', 'Systems design', 'Ownership', 'Velocity'],
    description:
      'Founding engineer for an early-stage startup. Own features end to ' +
      'end across the stack, design pragmatic systems, and ship quickly ' +
      'without a safety net. Strong CS fundamentals and high autonomy.'
  },
  {
    slug: 'design',
    title: 'Product Designer',
    stages: [...DEFAULT_STAGES],
    traits: ['Craft', 'Product sense', 'Communication', 'Systems thinking'],
    description:
      'Product designer who owns the end-to-end experience: research, ' +
      'interaction, and visual craft. Builds and maintains a design system ' +
      'and partners closely with engineering.'
  },
  {
    slug: 'gtm',
    title: 'GTM Lead',
    stages: [...DEFAULT_STAGES],
    traits: [...DEFAULT_TRAITS],
    description:
      'Go-to-market lead to build the first repeatable sales motion. ' +
      'Comfortable being technical with a product-led audience and owning ' +
      'pipeline from first touch to close.'
  }
];

export const SEED_CANDIDATES: SeedCandidate[] = [
  // Founding Engineer
  {
    job: 'eng',
    name: 'Ava Chen',
    stage: 'Screen',
    owner: benOng,
    source: 'LinkedIn',
    yearsExperience: 6,
    status: 'active',
    starred: true,
    linkedinUrl: 'https://www.linkedin.com/in/ava-chen',
    githubUrl: 'https://github.com/avachen',
    daysInStage: 3,
    feedback: [
      {
        by: benChan,
        note: 'Solid CS fundamentals, clean take-home.',
        traits: { 'Technical depth': 3, 'Systems design': 3, Ownership: 4 }
      },
      {
        by: hengHongLee,
        note: 'Excellent systems design — would move fast.',
        traits: { 'Systems design': 4, Velocity: 4, 'Technical depth': 4 }
      }
    ]
  },
  {
    job: 'eng',
    name: 'Marcus Webb',
    stage: 'Applied',
    owner: benChan,
    source: 'Referral',
    yearsExperience: 3,
    status: 'active',
    // 20 days in Applied, well past the universal 5-day warn threshold, so the
    // board flags him as stalled.
    daysInStage: 20,
    feedback: []
  },
  {
    job: 'eng',
    name: 'Priya Nair',
    stage: 'Interview',
    owner: hengHongLee,
    source: 'YC',
    yearsExperience: 9,
    status: 'active',
    starred: true,
    linkedinUrl: 'https://www.linkedin.com/in/priya-nair',
    // 12 days in Interview, past the universal 5-day warn threshold.
    daysInStage: 12,
    feedback: [
      { by: benOng, note: 'Sharp, great product instincts.' },
      { by: benChan, note: 'Strong, minor gaps in distributed systems.' }
    ]
  },
  {
    job: 'eng',
    name: 'Tom Alvarez',
    stage: 'Applied',
    owner: marcus,
    source: 'Inbound',
    yearsExperience: 1,
    status: 'active',
    daysInStage: 5,
    feedback: []
  },
  {
    job: 'eng',
    name: 'Sofia Kim',
    stage: 'Offer',
    owner: benChan,
    source: 'Referral',
    yearsExperience: 12,
    status: 'active',
    linkedinUrl: 'https://www.linkedin.com/in/sofia-kim',
    githubUrl: 'https://github.com/sofiakim',
    // 9 days sitting on the Offer, past the universal 5-day warn threshold;
    // nudge to close.
    daysInStage: 9,
    feedback: [
      {
        by: benOng,
        note: 'Best onsite so far.',
        traits: {
          'Technical depth': 4,
          'Systems design': 4,
          Ownership: 4,
          Velocity: 3
        }
      },
      {
        by: hengHongLee,
        note: 'Ship it — strong hire.',
        traits: { 'Systems design': 4, Velocity: 4 }
      },
      { by: benChan, note: 'Yes, aligned on comp.' },
      { by: marcus, note: 'Aligned — sending the offer.' }
    ]
  },
  {
    job: 'eng',
    name: 'Dan Osei',
    stage: 'Screen',
    owner: hengHongLee,
    source: 'LinkedIn',
    yearsExperience: 2,
    status: 'rejected',
    feedback: [
      { by: hengHongLee, note: 'Experience did not match the role level.' }
    ]
  },
  {
    job: 'eng',
    name: 'Lena Vogt',
    stage: 'Hired',
    owner: benOng,
    source: 'Referral',
    yearsExperience: 8,
    status: 'hired',
    feedback: [
      { by: benOng, note: 'Accepted — starting next month.' },
      { by: benChan, note: 'Great addition.' }
    ]
  },
  // Product Designer
  {
    job: 'design',
    name: 'Ravi Shah',
    stage: 'Applied',
    owner: benChan,
    source: 'Otta',
    yearsExperience: 4,
    status: 'active',
    feedback: []
  },
  {
    job: 'design',
    name: 'Mia Torres',
    stage: 'Interview',
    owner: hengHongLee,
    source: 'LinkedIn',
    yearsExperience: 7,
    status: 'active',
    linkedinUrl: 'https://www.linkedin.com/in/mia-torres',
    feedback: [
      {
        by: hengHongLee,
        note: 'Strong portfolio, thoughtful about systems.',
        traits: { Craft: 4, 'Systems thinking': 3, 'Product sense': 3 }
      }
    ]
  },
  {
    job: 'design',
    name: 'Noah Park',
    stage: 'Screen',
    owner: benOng,
    source: 'Referral',
    yearsExperience: null,
    status: 'onhold',
    feedback: [
      { by: benOng, note: 'Promising — paused while we align on level.' }
    ]
  },
  // GTM Lead
  {
    job: 'gtm',
    name: 'Ines Costa',
    stage: 'Applied',
    owner: benChan,
    source: 'Inbound',
    yearsExperience: 5,
    status: 'active',
    feedback: []
  },
  {
    job: 'gtm',
    name: 'Jack Reed',
    stage: 'Interview',
    owner: hengHongLee,
    source: 'LinkedIn',
    yearsExperience: 10,
    status: 'active',
    feedback: [
      { by: hengHongLee, note: 'Rare combo of GTM + technical depth.' }
    ]
  }
];

// Seed discussion threads so the per-candidate chat, @-mention highlighting, and
// the notification inbox all demonstrate on a fresh boot (the messages/mentions
// tables would otherwise ship empty). Every `@Display Name` token in a body has
// the matching email in `mentions`, so the seeder inserts a mention row that
// drives that user's inbox. Together these tag all four accounts, so each seeded
// login has at least one notification. Backdated so threads read in order.
export const SEED_MESSAGES: SeedMessage[] = [
  // Ava Chen (Screen) — a two-message thread tagging Marcus, then Ben.
  {
    candidate: 'Ava Chen',
    by: benChan,
    body: 'Take-home was clean. @Marcus Ang can you own the systems-design round?',
    mentions: [marcus],
    read: true,
    daysAgo: 2
  },
  {
    candidate: 'Ava Chen',
    by: marcus,
    body: 'On it. @Ben Ong want to pair on the interview panel?',
    mentions: [benOng],
    daysAgo: 1
  },
  // Priya Nair (Interview) — tags Heng Hong.
  {
    candidate: 'Priya Nair',
    by: benOng,
    body: 'Strong so far. @Heng Hong Lee can you dig into distributed systems next round?',
    mentions: [hengHongLee],
    daysAgo: 3
  },
  // Sofia Kim (Offer) — tags Marcus, then a plain reply.
  {
    candidate: 'Sofia Kim',
    by: benChan,
    body: 'Comp is aligned. @Marcus Ang ready to send the offer?',
    mentions: [marcus],
    daysAgo: 1
  },
  {
    candidate: 'Sofia Kim',
    by: marcus,
    body: 'Sending it today.'
  },
  // Mia Torres (Interview, design) — tags Benedict.
  {
    candidate: 'Mia Torres',
    by: hengHongLee,
    body: 'Portfolio is excellent. @Benedict Chan want to run the final design crit?',
    mentions: [benChan],
    daysAgo: 2
  },
  // Jack Reed (Interview, gtm) — tags Ben.
  {
    candidate: 'Jack Reed',
    by: hengHongLee,
    body: 'Great GTM instincts. @Ben Ong let us align on the comp band.',
    mentions: [benOng],
    daysAgo: 1
  }
];
