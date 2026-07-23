import { describe, it, expect } from 'vitest';
import { searchCandidates } from '@/lib/hiring/helpers';
import type {
  Candidate,
  Job,
  SeniorityBand,
  Source,
  User
} from '@/lib/hiring/types';

// Minimal factories — only the fields the search reads matter.
let seq = 0;
function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: ++seq,
    jobId: 1,
    name: 'Ada Lovelace',
    stage: 'Applied',
    owner: 1,
    source: 1,
    yearsExperience: null,
    status: 'active',
    starred: false,
    linkedinUrl: null,
    githubUrl: null,
    feedback: [],
    ...over
  };
}

const jobs: Job[] = [
  { id: 1, title: 'Founding Engineer', stages: ['Applied', 'Hired'], starred: false },
  { id: 2, title: 'Product Designer', stages: ['Applied', 'Hired'], starred: false }
];
const users: User[] = [
  { id: 1, firstName: 'Ben', lastName: 'Ong', email: 'ben@x.io' },
  { id: 2, firstName: 'Marcus', lastName: 'Ang', email: 'marcus@x.io' }
];
const sources: Source[] = [
  { id: 1, name: 'LinkedIn' },
  { id: 2, name: 'Referral' }
];
const bands: SeniorityBand[] = [
  { id: 1, label: 'Senior', minYears: 5 },
  { id: 2, label: 'Mid', minYears: 2 },
  { id: 3, label: 'Junior', minYears: 0 }
];
const ctx = { jobs, users, sources, bands };

describe('searchCandidates', () => {
  it('returns nothing for an empty / whitespace query', () => {
    const cands = [candidate()];
    expect(searchCandidates(cands, '', ctx)).toEqual([]);
    expect(searchCandidates(cands, '   ', ctx)).toEqual([]);
  });

  it('matches by candidate name, case-insensitively', () => {
    const cands = [candidate({ name: 'Ada Lovelace' }), candidate({ name: 'Grace Hopper' })];
    const hits = searchCandidates(cands, 'ada', ctx);
    expect(hits.map((h) => h.candidate.name)).toEqual(['Ada Lovelace']);
  });

  it('matches across job title, owner, source, seniority and stage', () => {
    const c = candidate({
      name: 'Zed',
      jobId: 2,
      owner: 2,
      source: 2,
      stage: 'Applied',
      yearsExperience: 6
    });
    const cands = [c, candidate({ name: 'Other', jobId: 1 })];
    expect(searchCandidates(cands, 'designer', ctx)).toHaveLength(1); // job title
    expect(searchCandidates(cands, 'marcus', ctx)).toHaveLength(1); // owner
    expect(searchCandidates(cands, 'referral', ctx)).toHaveLength(1); // source
    expect(searchCandidates(cands, 'senior', ctx)).toHaveLength(1); // seniority band
  });

  it('ANDs multiple free-text terms', () => {
    const cands = [
      candidate({ name: 'Ada', jobId: 2 }), // Product Designer
      candidate({ name: 'Ada', jobId: 1 }) // Founding Engineer
    ];
    const hits = searchCandidates(cands, 'ada designer', ctx);
    expect(hits).toHaveLength(1);
    expect(hits[0].jobTitle).toBe('Product Designer');
  });

  it('matches years of experience at or above the number term', () => {
    const cands = [
      candidate({ name: 'One', yearsExperience: 1 }),
      candidate({ name: 'Five', yearsExperience: 5 }),
      candidate({ name: 'Eight', yearsExperience: 8 })
    ];
    const hits = searchCandidates(cands, '5', ctx);
    expect(hits.map((h) => h.candidate.name).sort()).toEqual(['Eight', 'Five']);
  });

  it('a number term never matches a candidate with unspecified experience', () => {
    const cands = [candidate({ name: 'Unknown', yearsExperience: null })];
    expect(searchCandidates(cands, '5', ctx)).toEqual([]);
  });

  it('combines a text term and a number term (AND)', () => {
    const cands = [
      candidate({ name: 'Ada', yearsExperience: 6 }),
      candidate({ name: 'Ada', yearsExperience: 2 }),
      candidate({ name: 'Bob', yearsExperience: 8 })
    ];
    const hits = searchCandidates(cands, 'ada 5', ctx);
    expect(hits).toHaveLength(1);
    expect(hits[0].candidate.name).toBe('Ada');
    expect(hits[0].candidate.yearsExperience).toBe(6);
  });

  it('combines name, another text field and a number term (e.g. "ava linkedin 5")', () => {
    const cands = [
      candidate({ name: 'Ava', source: 1, yearsExperience: 6 }), // LinkedIn, 6y — match
      candidate({ name: 'Ava', source: 2, yearsExperience: 6 }), // Referral — text miss
      candidate({ name: 'Ava', source: 1, yearsExperience: 3 }), // LinkedIn but < 5y
      candidate({ name: 'Bob', source: 1, yearsExperience: 9 }) // name miss
    ];
    const hits = searchCandidates(cands, 'ava linkedin 5', ctx);
    expect(hits).toHaveLength(1);
    expect(hits[0].candidate.source).toBe(1);
    expect(hits[0].candidate.yearsExperience).toBe(6);
  });

  it('sorts starred candidates first, then by name', () => {
    const cands = [
      candidate({ name: 'Charlie', starred: false }),
      candidate({ name: 'Bravo', starred: true }),
      candidate({ name: 'Alpha', starred: false })
    ];
    const hits = searchCandidates(cands, 'a', ctx); // all contain "a"
    expect(hits.map((h) => h.candidate.name)).toEqual(['Bravo', 'Alpha', 'Charlie']);
  });

  it('caps the number of results at the given limit', () => {
    const cands = Array.from({ length: 20 }, (_, i) =>
      candidate({ name: `Match ${i}` })
    );
    expect(searchCandidates(cands, 'match', ctx, 5)).toHaveLength(5);
  });
});
