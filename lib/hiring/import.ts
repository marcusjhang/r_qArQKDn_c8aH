// Pure, client-safe resolver that turns an uploaded CSV into validated
// candidate-import payloads. It's the bridge between the raw parser (parseCsv,
// ./csv) and the server action (importCandidates, ./actions): it maps the
// header row to fields, resolves human labels back to the ids the board uses
// (job title → job id, owner name → user id, source name → source id, status
// label → status key), and validates each cell with the same helpers the
// add/edit forms use. Framework-free so the import dialog can preview results
// (valid rows + per-row errors) before anything is written, and so it's
// unit-testable without a DB.
//
// Server authority is preserved: the resolved rows are re-parsed by zod in the
// action, and owner/source ids are backed by foreign keys. This resolver exists
// for UX (an accurate preview) — it is not the security boundary.

import { parseCsv } from './csv';
import { STATUS, DEFAULT_STAGES } from './config';
import { displayName, normalizeProfileUrl, parseYearsInput } from './helpers';
import { STATUSES, MAX_IMPORT_ROWS } from './primitives';
import type { HiringState, Status } from './types';

/**
 * A validated, id-resolved candidate ready to send to the import action. When
 * `jobId` is null the job must be created from `jobTitle`; when `source` is null
 * the source must be created from `sourceName`. `stage` is optional — the server
 * defaults it to the job's first stage.
 */
export interface ImportRow {
  name: string;
  jobId: number | null;
  jobTitle: string;
  stage?: string;
  status: Status;
  owner: number;
  source: number | null;
  sourceName: string;
  yearsExperience: number | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
}

/** A human-readable problem with one CSV line (1-based; the header is line 1).
 * Not exported: it's consumed structurally through `ResolveResult.errors`, so
 * keeping it internal avoids an unused-export (the dead-code audit is enforced). */
interface RowError {
  line: number;
  message: string;
}

export interface ResolveResult {
  rows: ImportRow[];
  errors: RowError[];
}

export interface ResolveOptions {
  /** Fallback owner when a row leaves the Owner column blank (the signed-in user). */
  currentUserId: number | null;
}

// Canonical fields the importer understands, and the header spellings that map
// to each (all matched lower-cased + trimmed). Export-only headers (Seniority,
// Average rating, Feedback count, Starred) are intentionally absent, so they're
// ignored — that's what lets an exported file round-trip through import.
const HEADER_ALIASES: Record<string, string[]> = {
  job: ['job'],
  name: ['candidate', 'name'],
  stage: ['stage'],
  status: ['status'],
  owner: ['owner'],
  source: ['source'],
  years: ['years experience', 'years', 'years of experience'],
  linkedin: ['linkedin url', 'linkedin'],
  github: ['github url', 'github']
};

// Build "spelling" → canonical-field lookup once.
const HEADER_LOOKUP: Record<string, string> = Object.fromEntries(
  Object.entries(HEADER_ALIASES).flatMap(([field, spellings]) =>
    spellings.map((s) => [s, field])
  )
);

// Status resolution accepts both the stored key ("onhold") and the UI label
// ("On hold"), case-insensitively.
const STATUS_LOOKUP: Record<string, Status> = (() => {
  const m: Record<string, Status> = {};
  for (const key of STATUSES) {
    m[key.toLowerCase()] = key;
    m[STATUS[key].toLowerCase()] = key;
  }
  return m;
})();

const norm = (s: string) => s.trim().toLowerCase();

/** Resolve a header row into a canonical-field → column-index map. */
function mapHeader(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((cell, i) => {
    const field = HEADER_LOOKUP[norm(cell)];
    if (field && !(field in map)) map[field] = i;
  });
  return map;
}

/**
 * Parse and resolve a CSV document against the current board state. Returns the
 * importable rows and a list of per-line errors — a caller can import the valid
 * rows and surface the errors. A structural problem (empty file, missing
 * required column) is reported as a single error on the header line with no rows.
 */
export function resolveImportRows(
  text: string,
  state: HiringState,
  { currentUserId }: ResolveOptions
): ResolveResult {
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (table.length === 0) {
    return { rows: [], errors: [{ line: 1, message: 'The file is empty.' }] };
  }

  const [header, ...body] = table;
  const col = mapHeader(header);
  if (col.name === undefined || col.job === undefined) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message:
            'Missing required column(s). The file needs at least "Job" and "Candidate" headers.'
        }
      ]
    };
  }

  const rows: ImportRow[] = [];
  const errors: RowError[] = [];

  body.forEach((cells, i) => {
    const line = i + 2; // header is line 1
    const get = (field: string) =>
      col[field] === undefined ? '' : (cells[col[field]] ?? '').trim();
    const fail = (message: string) => errors.push({ line, message });

    const name = get('name');
    if (!name) return fail('Candidate name is required.');
    if (name.length > 120) return fail('Candidate name is too long (max 120).');

    // Job — resolve to an existing id (case-insensitive) or flag for creation.
    const jobRaw = get('job');
    if (!jobRaw) return fail('Job is required.');
    const job = state.jobs.find((j) => norm(j.title) === norm(jobRaw));
    const jobId = job?.id ?? null;
    const jobTitle = job?.title ?? jobRaw;
    if (!jobId && jobRaw.length > 80) {
      return fail('New job title is too long (max 80).');
    }
    // Pipeline the row will land in — the real job's stages, or the defaults a
    // to-be-created job will get.
    const pipeline = job?.stages ?? DEFAULT_STAGES;

    // Stage — optional; when given it must exist in the target pipeline.
    const stageRaw = get('stage');
    let stage: string | undefined;
    if (stageRaw) {
      const match = pipeline.find((s) => norm(s) === norm(stageRaw));
      if (!match) {
        return fail(
          `Stage "${stageRaw}" is not in ${jobTitle}'s pipeline (${pipeline.join(
            ' → '
          )}).`
        );
      }
      stage = match;
    }

    // Status — optional; defaults to active.
    const statusRaw = get('status');
    let status: Status = 'active';
    if (statusRaw) {
      const resolved = STATUS_LOOKUP[norm(statusRaw)];
      if (!resolved) {
        return fail(
          `Unknown status "${statusRaw}". Allowed: ${STATUSES.map(
            (s) => STATUS[s]
          ).join(', ')}.`
        );
      }
      status = resolved;
    }

    // Owner — match by display name or email; blank falls back to the current
    // user. Owners must be existing accounts (imports can't mint logins).
    const ownerRaw = get('owner');
    let owner: number;
    if (!ownerRaw) {
      if (currentUserId == null) {
        return fail('Owner is required (no signed-in user to default to).');
      }
      owner = currentUserId;
    } else {
      const match = state.users.find(
        (u) => norm(displayName(u)) === norm(ownerRaw) || norm(u.email) === norm(ownerRaw)
      );
      if (!match) {
        return fail(
          `Unknown owner "${ownerRaw}". Owners must be existing team members.`
        );
      }
      owner = match.id;
    }

    // Source — required; resolve to an existing id or flag for creation.
    const sourceRaw = get('source');
    if (!sourceRaw) return fail('Source is required.');
    if (sourceRaw.length > 120) return fail('Source name is too long (max 120).');
    const src = state.sources.find((s) => norm(s.name) === norm(sourceRaw));
    const source = src?.id ?? null;
    const sourceName = src?.name ?? sourceRaw;

    // Years of experience — optional; same rule as the add-candidate form.
    const years = parseYearsInput(get('years'));
    if (!years.ok) return fail('Years experience must be a whole number 0–60.');

    // Profile URLs — optional; same normalization as the forms.
    const linkedin = normalizeProfileUrl(get('linkedin'));
    if (!linkedin.ok) return fail('LinkedIn URL must be a valid http(s) URL.');
    const github = normalizeProfileUrl(get('github'));
    if (!github.ok) return fail('GitHub URL must be a valid http(s) URL.');

    rows.push({
      name,
      jobId,
      jobTitle,
      stage,
      status,
      owner,
      source,
      sourceName,
      yearsExperience: years.value,
      linkedinUrl: linkedin.value,
      githubUrl: github.value
    });
  });

  // Mirror the server's per-call cap (importCandidatesSchema). Block the whole
  // upload rather than importing a silent subset — the caller can split it.
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message: `Too many rows to import at once (${rows.length}). Import at most ${MAX_IMPORT_ROWS} candidates per file.`
        }
      ]
    };
  }

  return { rows, errors };
}

/** New job titles a resolved set will create (deduped, preserving first-seen). */
export function newJobTitles(rows: ImportRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (r.jobId == null && !seen.has(norm(r.jobTitle))) {
      seen.add(norm(r.jobTitle));
      out.push(r.jobTitle);
    }
  }
  return out;
}

/** New source names a resolved set will create (deduped, preserving first-seen). */
export function newSourceNames(rows: ImportRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (r.source == null && !seen.has(norm(r.sourceName))) {
      seen.add(norm(r.sourceName));
      out.push(r.sourceName);
    }
  }
  return out;
}
