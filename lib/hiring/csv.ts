// CSV serialization + parser for board export/import. Pure and framework-free. EXPORT_COLUMNS is a superset of IMPORT_COLUMNS (import omits derived columns), so an exported file re-imports cleanly (matched by header name, extras ignored).

import { RATINGS, STATUS } from './config';
import {
  overallScore,
  displayName,
  seniorityFor,
  sourceName,
  userById
} from './helpers';
import type { HiringState } from './types';

/**
 * Escape one field per RFC 4180 (quote when it contains comma/quote/CR/LF, doubling embedded quotes).
 * Also guards CSV/formula injection: a cell starting with `= + - @` (or tab/CR) gets a leading apostrophe so Excel/Sheets treat it as literal text, not a formula.
 */
export function escapeCsvField(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

/** Join a matrix of cells into a CSV document: each cell coerced to string and escaped, rows CRLF-terminated (RFC 4180). Ragged rows are fine. */
export function rowsToCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => escapeCsvField(cell == null ? '' : String(cell))).join(',')
    )
    .join('\r\n');
}

/** Parse a CSV document into a matrix of string cells (inverse of `rowsToCsv`): RFC 4180 quoted fields, `""` escapes, commas/CR/LF preserved within quotes; a leading UTF-8 BOM is stripped. */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // consume the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      // Bare '\r' outside quotes is a CRLF artifact — drop it (a quoted '\r' is kept above).
      field += ch;
    }
  }
  // Flush the trailing field/row unless the text ended exactly on a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Full board-export column headers, in order. Includes derived columns. */
export const EXPORT_COLUMNS = [
  'Job',
  'Candidate',
  'Stage',
  'Status',
  'Owner',
  'Source',
  'Years experience',
  'Seniority',
  'Overall score',
  'Feedback count',
  'Starred',
  'LinkedIn URL',
  'GitHub URL'
] as const;

/** The importable columns (the template's column order). Derived columns and Starred are export-only. The importer matches by header name, so this order is for humans. */
export const IMPORT_COLUMNS = [
  'Job',
  'Candidate',
  'Stage',
  'Status',
  'Owner',
  'Source',
  'Years experience',
  'LinkedIn URL',
  'GitHub URL'
] as const;

// Human label for a status key (falls back to the raw key if unmapped).
function statusLabel(status: string): string {
  return STATUS[status as keyof typeof STATUS] ?? status;
}

// Overall score rendered for a cell: "3.5 (Strong Yes)" or '' with no scores.
function scoreCell(average: number | null): string {
  if (average == null) return '';
  const rounded = Math.min(4, Math.max(1, Math.round(average)));
  const label = RATINGS[rounded as keyof typeof RATINGS]?.label ?? '';
  return `${average.toFixed(1)}${label ? ` (${label})` : ''}`;
}

/** One export row for a candidate, every id resolved to its board label; `jobTitle`/`traits` are passed in. Column order matches EXPORT_COLUMNS. */
function candidateRow(
  state: HiringState,
  jobTitle: string,
  traits: string[],
  c: HiringState['candidates'][number]
): (string | number | null)[] {
  return [
    jobTitle,
    c.name,
    c.stage,
    statusLabel(c.status),
    displayName(userById(state.users, c.owner)),
    sourceName(state.sources, c.source),
    c.yearsExperience ?? '',
    seniorityFor(state.bands, c.yearsExperience) ?? '',
    scoreCell(overallScore(traits, c)),
    c.feedback.length,
    c.starred ? 'yes' : 'no',
    c.linkedinUrl ?? '',
    c.githubUrl ?? ''
  ];
}

/** Full board export: the header row plus one row per candidate across every job, ordered by job then upstream candidate order. No data yields a header-only CSV. */
export function buildExportCsv(state: HiringState): string {
  const rows: (string | number | null)[][] = [[...EXPORT_COLUMNS]];
  for (const job of state.jobs) {
    for (const c of state.candidates.filter((c) => c.jobId === job.id)) {
      rows.push(candidateRow(state, job.title, job.traits, c));
    }
  }
  return rowsToCsv(rows);
}

/** A ready-to-fill import template: the IMPORT_COLUMNS header plus example rows drawn from the user's actual config (real job/stage/owner/source), falling back to placeholders before any config exists. */
export function buildTemplateCsv(state: HiringState): string {
  const firstJob = state.jobs[0];
  const secondJob = state.jobs[1] ?? firstJob;
  const owner = state.users[0];
  const secondOwner = state.users[1] ?? owner;

  const jobTitle = firstJob?.title ?? 'Software Engineer';
  const secondTitle = secondJob?.title ?? jobTitle;
  const firstStage = firstJob?.stages[0] ?? 'Applied';
  const secondStage = secondJob?.stages[1] ?? secondJob?.stages[0] ?? 'Screen';
  const ownerName = owner ? displayName(owner) : '';
  const secondOwnerName = secondOwner ? displayName(secondOwner) : '';
  const sourceLabel = state.sources[0]?.name ?? 'LinkedIn';
  const secondSourceLabel = state.sources[1]?.name ?? sourceLabel;

  // Rows follow IMPORT_COLUMNS order: [Job, Candidate, Stage, Status, Owner, Source, Years, LinkedIn, GitHub]
  const rows: (string | number | null)[][] = [
    [...IMPORT_COLUMNS],
    [
      jobTitle,
      'Ada Lovelace',
      firstStage,
      STATUS.active,
      ownerName,
      sourceLabel,
      6,
      'https://www.linkedin.com/in/example',
      'https://github.com/example'
    ],
    [
      secondTitle,
      'Alan Turing',
      secondStage,
      STATUS.onhold,
      secondOwnerName,
      secondSourceLabel,
      12,
      '',
      ''
    ]
  ];
  return rowsToCsv(rows);
}

/** A dated filename for a downloaded CSV (e.g. `hiring-export-2026-07-22.csv`); the date is passed in so this stays pure. */
export function csvFilename(prefix: string, date: Date): string {
  const iso = date.toISOString().slice(0, 10);
  return `${prefix}-${iso}.csv`;
}
