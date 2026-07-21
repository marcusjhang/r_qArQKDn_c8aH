// Seed / sample data loaded on boot (Decision 8).
//
// Three realistic roles with ~12 candidates spread across stages, mixed
// ratings, statuses, sources, and owners — including one rejected and one
// hired candidate to demonstrate the terminal-state filter.

import { DEFAULT_STAGES } from './config';
import type { HiringState, Job, Candidate } from './types';

function makeJobs(): Job[] {
  return [
    { id: 'eng', title: 'Founding Engineer', stages: [...DEFAULT_STAGES] },
    { id: 'design', title: 'Product Designer', stages: [...DEFAULT_STAGES] },
    { id: 'gtm', title: 'GTM Lead', stages: [...DEFAULT_STAGES] }
  ];
}

function makeCandidates(): Candidate[] {
  return [
    // Founding Engineer
    {
      id: 101,
      job: 'eng',
      name: 'Ava Chen',
      stage: 'Screen',
      owner: 'bo',
      source: 'LinkedIn',
      status: 'active',
      feedback: [
        { by: 'bc', v: 3, note: 'Solid CS fundamentals, clean take-home.' },
        { by: 'hl', v: 4, note: 'Excellent systems design — would move fast.' }
      ]
    },
    {
      id: 102,
      job: 'eng',
      name: 'Marcus Webb',
      stage: 'Applied',
      owner: 'bc',
      source: 'Referral',
      status: 'active',
      feedback: []
    },
    {
      id: 103,
      job: 'eng',
      name: 'Priya Nair',
      stage: 'Interview',
      owner: 'hl',
      source: 'YC',
      status: 'active',
      feedback: [
        { by: 'bo', v: 4, note: 'Sharp, great product instincts.' },
        { by: 'bc', v: 3, note: 'Strong, minor gaps in distributed systems.' }
      ]
    },
    {
      id: 104,
      job: 'eng',
      name: 'Tom Alvarez',
      stage: 'Applied',
      owner: 'bo',
      source: 'Inbound',
      status: 'active',
      feedback: []
    },
    {
      id: 105,
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
      id: 106,
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
      id: 107,
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
      id: 108,
      job: 'design',
      name: 'Ravi Shah',
      stage: 'Applied',
      owner: 'bc',
      source: 'Otta',
      status: 'active',
      feedback: []
    },
    {
      id: 109,
      job: 'design',
      name: 'Mia Torres',
      stage: 'Interview',
      owner: 'hl',
      source: 'LinkedIn',
      status: 'active',
      feedback: [
        { by: 'hl', v: 3, note: 'Strong portfolio, thoughtful about systems.' }
      ]
    },
    {
      id: 110,
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
      id: 111,
      job: 'gtm',
      name: 'Ines Costa',
      stage: 'Applied',
      owner: 'bc',
      source: 'Inbound',
      status: 'active',
      feedback: []
    },
    {
      id: 112,
      job: 'gtm',
      name: 'Jack Reed',
      stage: 'Interview',
      owner: 'hl',
      source: 'LinkedIn',
      status: 'active',
      feedback: [
        { by: 'hl', v: 4, note: 'Rare combo of GTM + technical depth.' }
      ]
    }
  ];
}

/** Fresh seed state. `nextId` continues past the highest seeded id. */
export function seedState(): HiringState {
  const candidates = makeCandidates();
  const nextId = candidates.reduce((m, c) => Math.max(m, c.id), 100) + 1;
  return { jobs: makeJobs(), candidates, nextId };
}
