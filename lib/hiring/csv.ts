// CSV serialization for the board's "Export CSV" / "Download template" actions
// and the low-level parser the importer builds on.
//
// Pure and framework-free (no DOM, no server APIs) so the whole thing is
// unit-testable and can live behind the `@/lib/hiring` client barrel. The
// components only turn the returned strings into a browser download, and the
// importer (lib/hiring/import.ts) resolves parsed rows against board state.
//
// Two column sets, single-sourced here:
//   • EXPORT_COLUMNS — the full board snapshot, including derived, read-only
//     columns (seniority, average rating, feedback count).
//   • IMPORT_COLUMNS — the strict subset that can be imported. Derived columns
//     are omitted because they're computed, never set. The export is a superset
//     of the import, so a file produced by "Export candidates" re-imports
//     cleanly (the importer matches by header name and ignores the extras).

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
 * Escape one field per RFC 4180: wrap in double quotes when it contains a
 * comma, quote, CR or LF, doubling any embedded quote. Plain values are left
 * untouched so a typical export stays diff-friendly and human-readable.
 */
export function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Join a matrix of cells into a CSV document. Every cell is coerced to a string
 * and escaped; rows are CRLF-terminated (the RFC 4180 line ending, which Excel
 * and Google Sheets both expect). Ragged rows are fine — each row is joined
 * independently.
 */
export function rowsToCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => escapeCsvField(cell == null ? '' : String(cell))).join(',')
    )
    .join('\r\n');
}

/**
 * Parse a CSV document into a matrix of string cells — the inverse of
 * `rowsToCsv` and the foundation the importer resolves against. Implements the
 * RFC 4180 rules that matter for round-tripping: double-quoted fields, `""`
 * escapes inside them, and commas / CR / LF preserved within quotes. A leading
 * UTF-8 BOM (which the export prepends for Excel) is stripped. Empty input
 * yields an empty matrix.
 */
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
      // Bare '\r' outside quotes is a line-ending artifact (CRLF) — drop it; a
      // '\r' *inside* quotes is preserved by the in-quotes branch above.
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

/**
 * The importable columns — the subset a user can fill in and upload. Order is
 * the template's column order. Derived columns (Seniority, Overall score,
 * Feedback count) and Starred are export-only: they're computed or not part of
 * candidate creation. The importer matches by header name, so this order is for
 * humans, not the parser.
 */
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
// The score is the candidate's rank-weighted trait average (1–4), so the same
// RATINGS labels apply to the rounded value.
function scoreCell(average: number | null): string {
  if (average == null) return '';
  const rounded = Math.min(4, Math.max(1, Math.round(average)));
  const label = RATINGS[rounded as keyof typeof RATINGS]?.label ?? '';
  return `${average.toFixed(1)}${label ? ` (${label})` : ''}`;
}

/**
 * One export row for a candidate, with every id resolved to the label the board
 * shows. `jobTitle` and the job's ranked `traits` are passed in (resolved by the
 * caller against `state.jobs`) so this stays a simple projection — the overall
 * score is the rank-weighted average over those traits. Column order matches
 * EXPORT_COLUMNS.
 */
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

/**
 * Full board export: the header row plus one row per candidate across every
 * job, ordered by job (matching the tab order the state arrives in) and then by
 * the candidate order already established upstream. Reactive to whatever the
 * user has created — no jobs/candidates yields a header-only CSV.
 */
export function buildExportCsv(state: HiringState): string {
  const rows: (string | number | null)[][] = [[...EXPORT_COLUMNS]];
  for (const job of state.jobs) {
    for (const c of state.candidates.filter((c) => c.jobId === job.id)) {
      rows.push(candidateRow(state, job.title, job.traits, c));
    }
  }
  return rowsToCsv(rows);
}

/**
 * A ready-to-fill import template: the IMPORT_COLUMNS header plus a couple of
 * example rows drawn from the user's *actual* configuration (a real job + its
 * first stage, a real owner/source) so the values are valid on day one. Falls
 * back to neutral placeholders before any config exists. Nothing but header +
 * examples goes in the file — the list of allowed values lives in the import
 * dialog, not as pseudo-comment rows the spreadsheet would treat as data.
 */
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

  // Rows follow IMPORT_COLUMNS order:
  // [Job, Candidate, Stage, Status, Owner, Source, Years, LinkedIn, GitHub]
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

/** A filesystem-safe, dated filename for a downloaded CSV, e.g.
 * `hiring-export-2026-07-22.csv`. The date is passed in so this stays pure. */
export function csvFilename(prefix: string, date: Date): string {
  const iso = date.toISOString().slice(0, 10);
  return `${prefix}-${iso}.csv`;
}
