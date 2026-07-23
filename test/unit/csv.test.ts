import { describe, it, expect } from 'vitest';
import {
  escapeCsvField,
  rowsToCsv,
  parseCsv,
  EXPORT_COLUMNS,
  IMPORT_COLUMNS,
  buildExportCsv,
  buildTemplateCsv,
  csvFilename
} from '@/lib/hiring/csv';
import type { HiringState } from '@/lib/hiring/types';

// A small but complete board fixture — two jobs, a couple of candidates, and
// the DB-driven config (users/sources/bands) the builders resolve against.
function board(over: Partial<HiringState> = {}): HiringState {
  return {
    jobs: [
      { id: 1, title: 'Software Engineer', stages: ['Applied', 'Screen', 'Hired'], starred: false },
      { id: 2, title: 'Designer', stages: ['Applied', 'Interview', 'Hired'], starred: false }
    ],
    candidates: [
      {
        id: 10,
        jobId: 1,
        name: 'Ada Lovelace',
        stage: 'Screen',
        stageEnteredAt: new Date(0),
        owner: 1,
        source: 1,
        yearsExperience: 6,
        status: 'active',
        starred: true,
        linkedinUrl: 'https://www.linkedin.com/in/ada',
        githubUrl: null,
        feedback: [
          { id: 1, byUser: 1, rating: 4, note: '' },
          { id: 2, byUser: 2, rating: 3, note: '' }
        ]
      },
      {
        id: 11,
        jobId: 2,
        name: 'Alan Turing',
        stage: 'Interview',
        stageEnteredAt: new Date(0),
        owner: 2,
        source: 2,
        yearsExperience: null,
        status: 'onhold',
        starred: false,
        linkedinUrl: null,
        githubUrl: null,
        feedback: []
      }
    ],
    users: [
      { id: 1, firstName: 'Ben', lastName: 'Ong', email: 'benong@example.com' },
      { id: 2, firstName: null, lastName: null, email: 'chan@example.com' }
    ],
    sources: [
      { id: 1, name: 'LinkedIn' },
      { id: 2, name: 'Referral' }
    ],
    bands: [
      { id: 1, label: 'Senior', minYears: 5 },
      { id: 2, label: 'Mid', minYears: 2 },
      { id: 3, label: 'Junior', minYears: 0 }
    ],
    stageWarnDays: 5,
    ...over
  };
}

describe('escapeCsvField', () => {
  it('leaves plain values untouched', () => {
    expect(escapeCsvField('Applied')).toBe('Applied');
  });

  it('quotes and doubles embedded quotes, commas and newlines', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('rowsToCsv', () => {
  it('coerces cells, CRLF-terminates rows, and blanks null/undefined', () => {
    expect(rowsToCsv([['a', 1, null, undefined], ['b', 2]])).toBe(
      'a,1,,\r\nb,2'
    );
  });
});

describe('parseCsv', () => {
  it('round-trips rowsToCsv, preserving quotes, commas and embedded newlines', () => {
    const rows = [
      ['Job', 'Candidate', 'Note'],
      ['Software, Sr', 'Ada "Countess" Lovelace', 'line1\nline2'],
      ['Design', 'Alan', '']
    ];
    expect(parseCsv(rowsToCsv(rows))).toEqual(rows);
  });

  it('accepts both CRLF and LF line endings and strips a leading BOM', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('﻿a,b')).toEqual([['a', 'b']]);
  });

  it('returns an empty matrix for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('buildExportCsv', () => {
  it('emits a header plus one resolved row per candidate, grouped by job', () => {
    const csv = buildExportCsv(board());
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe(EXPORT_COLUMNS.join(','));
    expect(lines).toHaveLength(3);

    // Ada: name resolved, source resolved, seniority derived, avg rating shown.
    expect(lines[1]).toContain('Software Engineer');
    expect(lines[1]).toContain('Ada Lovelace');
    expect(lines[1]).toContain('Ben Ong'); // owner id → display name
    expect(lines[1]).toContain('LinkedIn'); // source id → name
    expect(lines[1]).toContain('Senior'); // 6 yrs → Senior band
    expect(lines[1]).toContain('3.5 (Strong Yes)'); // (4+3)/2 mean, rounds to 4
    expect(lines[1]).toContain('yes'); // starred

    // Alan: no feedback → empty rating, no experience → empty seniority, and a
    // user with no name falls back to the email.
    const alan = lines[2].split(',');
    expect(lines[2]).toContain('Designer');
    expect(lines[2]).toContain('chan@example.com');
    expect(lines[2]).toContain('On hold'); // status label
    expect(alan[6]).toBe(''); // years experience blank
    expect(alan[8]).toBe(''); // average rating blank
  });

  it('reflects live state — no jobs/candidates yields a header-only CSV', () => {
    const csv = buildExportCsv(board({ jobs: [], candidates: [] }));
    expect(csv).toBe(EXPORT_COLUMNS.join(','));
  });
});

describe('buildTemplateCsv', () => {
  it('uses the importable header and example rows drawn from real config', () => {
    const csv = buildTemplateCsv(board());
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(IMPORT_COLUMNS.join(','));
    expect(lines).toHaveLength(3); // header + two example rows
    // Example rows use the user's actual first job/stage/owner/source.
    expect(lines[1]).toContain('Software Engineer');
    expect(lines[1]).toContain('Applied');
    expect(lines[1]).toContain('Ben Ong');
    expect(lines[1]).toContain('LinkedIn');
  });

  it('contains no reference/comment block and no derived columns', () => {
    const csv = buildTemplateCsv(board());
    expect(csv).not.toContain('#');
    expect(csv).not.toContain('Reference');
    // The importable header omits the derived/export-only columns.
    expect(csv).not.toContain('Average rating');
    expect(csv).not.toContain('Seniority');
    expect(csv).not.toContain('Feedback count');
  });

  it('degrades to placeholders with no config yet', () => {
    const empty = board({ jobs: [], candidates: [], users: [], sources: [], bands: [] });
    const csv = buildTemplateCsv(empty);
    expect(csv.split('\r\n')[0]).toBe(IMPORT_COLUMNS.join(','));
    expect(csv).toContain('Software Engineer'); // placeholder job
    expect(csv).toContain('LinkedIn'); // placeholder source
  });
});

describe('csvFilename', () => {
  it('builds a dated, prefixed filename', () => {
    expect(csvFilename('hiring-export', new Date('2026-07-22T10:00:00Z'))).toBe(
      'hiring-export-2026-07-22.csv'
    );
  });
});
