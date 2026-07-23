import { describe, it, expect } from 'vitest';
import {
  resolveImportRows,
  newJobTitles,
  newSourceNames
} from '@/lib/hiring/import';
import { rowsToCsv, EXPORT_COLUMNS } from '@/lib/hiring/csv';
import type { HiringState } from '@/lib/hiring/types';

function board(over: Partial<HiringState> = {}): HiringState {
  return {
    jobs: [
      { id: 1, title: 'Software Engineer', stages: ['Applied', 'Screen', 'Hired'], starred: false }
    ],
    candidates: [],
    users: [
      { id: 1, firstName: 'Ben', lastName: 'Ong', email: 'benong@example.com' },
      { id: 2, firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }
    ],
    sources: [{ id: 1, name: 'LinkedIn' }],
    bands: [],
    ...over
  };
}

// Build a CSV from a header + row objects keyed by column name.
function csv(header: string[], rows: Record<string, string>[]): string {
  return rowsToCsv([header, ...rows.map((r) => header.map((h) => r[h] ?? ''))]);
}

const IMPORT_HEADER = [
  'Job',
  'Candidate',
  'Stage',
  'Status',
  'Owner',
  'Source',
  'Years experience',
  'LinkedIn URL',
  'GitHub URL'
];

describe('resolveImportRows — happy path', () => {
  it('resolves labels to ids against the board', () => {
    const text = csv(IMPORT_HEADER, [
      {
        Job: 'Software Engineer',
        Candidate: 'Grace Hopper',
        Stage: 'Screen',
        Status: 'Active',
        Owner: 'Ben Ong',
        Source: 'LinkedIn',
        'Years experience': '7',
        'LinkedIn URL': 'https://linkedin.com/in/grace'
      }
    ]);
    const { rows, errors } = resolveImportRows(text, board(), { currentUserId: 1 });
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Grace Hopper',
      jobId: 1,
      jobTitle: 'Software Engineer',
      stage: 'Screen',
      status: 'active',
      owner: 1,
      source: 1,
      sourceName: 'LinkedIn',
      yearsExperience: 7,
      linkedinUrl: 'https://linkedin.com/in/grace',
      githubUrl: null
    });
  });

  it('accepts a status key ("onhold") as well as the label ("On hold")', () => {
    const mk = (status: string) =>
      resolveImportRows(
        csv(IMPORT_HEADER, [
          { Job: 'Software Engineer', Candidate: 'X', Owner: 'Ben Ong', Source: 'LinkedIn', Status: status }
        ]),
        board(),
        { currentUserId: 1 }
      ).rows[0].status;
    expect(mk('onhold')).toBe('onhold');
    expect(mk('On hold')).toBe('onhold');
  });

  it('defaults blank Owner to the current user and matches owner by email', () => {
    const { rows } = resolveImportRows(
      csv(IMPORT_HEADER, [
        { Job: 'Software Engineer', Candidate: 'A', Source: 'LinkedIn' },
        { Job: 'Software Engineer', Candidate: 'B', Owner: 'ada@example.com', Source: 'LinkedIn' }
      ]),
      board(),
      { currentUserId: 2 }
    );
    expect(rows[0].owner).toBe(2); // blank → current user
    expect(rows[1].owner).toBe(2); // matched by email
  });
});

describe('resolveImportRows — creation flags', () => {
  it('flags an unknown job for creation (jobId null, title kept)', () => {
    const { rows } = resolveImportRows(
      csv(IMPORT_HEADER, [
        { Job: 'Growth Lead', Candidate: 'New', Owner: 'Ben Ong', Source: 'LinkedIn' }
      ]),
      board(),
      { currentUserId: 1 }
    );
    expect(rows[0].jobId).toBeNull();
    expect(rows[0].jobTitle).toBe('Growth Lead');
    expect(newJobTitles(rows)).toEqual(['Growth Lead']);
  });

  it('flags an unknown source for creation (source null, name kept)', () => {
    const { rows } = resolveImportRows(
      csv(IMPORT_HEADER, [
        { Job: 'Software Engineer', Candidate: 'New', Owner: 'Ben Ong', Source: 'Otta' }
      ]),
      board(),
      { currentUserId: 1 }
    );
    expect(rows[0].source).toBeNull();
    expect(rows[0].sourceName).toBe('Otta');
    expect(newSourceNames(rows)).toEqual(['Otta']);
  });
});

describe('resolveImportRows — per-row errors', () => {
  const one = (over: Record<string, string>) =>
    resolveImportRows(
      csv(IMPORT_HEADER, [
        { Job: 'Software Engineer', Candidate: 'Valid', Owner: 'Ben Ong', Source: 'LinkedIn', ...over }
      ]),
      board(),
      { currentUserId: 1 }
    );

  it('rejects an unknown owner', () => {
    const { rows, errors } = one({ Owner: 'Nobody' });
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/Unknown owner/);
    expect(errors[0].line).toBe(2);
  });

  it('rejects a stage not in the target pipeline', () => {
    expect(one({ Stage: 'Nonexistent' }).errors[0].message).toMatch(/pipeline/);
  });

  it('rejects an unknown status, a bad years value, and a bad URL', () => {
    expect(one({ Status: 'Maybe' }).errors[0].message).toMatch(/Unknown status/);
    expect(one({ 'Years experience': 'lots' }).errors[0].message).toMatch(/whole number/);
    expect(one({ 'LinkedIn URL': 'not-a-url' }).errors[0].message).toMatch(/valid http/);
  });

  it('requires candidate name and source', () => {
    expect(one({ Candidate: '' }).errors[0].message).toMatch(/name is required/);
    expect(one({ Source: '' }).errors[0].message).toMatch(/Source is required/);
  });
});

describe('resolveImportRows — structural', () => {
  it('errors on an empty file', () => {
    expect(resolveImportRows('', board(), { currentUserId: 1 }).errors[0].message).toMatch(
      /empty/
    );
  });

  it('errors when required columns are missing', () => {
    const { errors } = resolveImportRows('Foo,Bar\n1,2', board(), { currentUserId: 1 });
    expect(errors[0].message).toMatch(/Missing required column/);
  });

  it('ignores extra export-only columns so an exported file re-imports', () => {
    // A row shaped like the full EXPORT_COLUMNS (with derived columns) should
    // still resolve — the importer keys off header names and drops the extras.
    const exported = rowsToCsv([
      [...EXPORT_COLUMNS],
      [
        'Software Engineer', 'Grace', 'Screen', 'Active', 'Ben Ong', 'LinkedIn',
        '7', 'Senior', '3.0 (Yes)', '2', 'yes', '', ''
      ]
    ]);
    const { rows, errors } = resolveImportRows(exported, board(), { currentUserId: 1 });
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ name: 'Grace', jobId: 1, owner: 1, source: 1 });
  });
});
