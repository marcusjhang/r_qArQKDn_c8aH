// Global cross-job candidate search. Pure so the match rule stays unit-testable: text terms match the candidate's text fields, a bare number term is a minimum years-of-experience filter.

import { STATUS } from '../config';
import type { Candidate, Job, SeniorityBand, Source, User } from '../types';
import { displayName, sourceName, userById } from './users';
import { seniorityFor } from './seniority';

/** The board lookups the search resolves display + filter fields against. */
export interface CandidateSearchContext {
  jobs: Job[];
  users: User[];
  sources: Source[];
  bands: SeniorityBand[];
}

/** One search hit: the candidate plus the human-readable context the dropdown shows and searches over. */
export interface CandidateMatch {
  candidate: Candidate;
  jobTitle: string;
  ownerName: string;
  sourceLabel: string;
  seniority: string | null;
}

/** Resolve a candidate into a match with its display/search context filled in. */
function toMatch(
  candidate: Candidate,
  ctx: CandidateSearchContext
): CandidateMatch {
  const job = ctx.jobs.find((j) => j.id === candidate.jobId);
  return {
    candidate,
    jobTitle: job?.title ?? 'Unknown role',
    ownerName: displayName(userById(ctx.users, candidate.owner)),
    sourceLabel: sourceName(ctx.sources, candidate.source),
    seniority: seniorityFor(ctx.bands, candidate.yearsExperience)
  };
}

/** The lower-cased text a free-text term is matched against for a candidate. */
function haystack(m: CandidateMatch): string {
  const c = m.candidate;
  return [
    c.name,
    m.jobTitle,
    m.ownerName,
    m.sourceLabel,
    m.seniority ?? '',
    c.stage,
    STATUS[c.status]
  ]
    .join(' ')
    .toLowerCase();
}

/** Search every candidate: whitespace-split terms, all must match (AND) — a bare integer is a minimum-years filter (unspecified never matches), any other term must appear in the searchable text. Empty query → []; starred-first then name A→Z, capped at `limit`. */
export function searchCandidates(
  candidates: Candidate[],
  query: string,
  ctx: CandidateSearchContext,
  limit = 8
): CandidateMatch[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const yearTerms: number[] = [];
  const textTerms: string[] = [];
  for (const token of trimmed.split(/\s+/)) {
    if (/^\d+$/.test(token)) yearTerms.push(Number(token));
    else textTerms.push(token.toLowerCase());
  }

  const matches = candidates
    .map((candidate) => toMatch(candidate, ctx))
    .filter((m) => {
      if (yearTerms.length) {
        const years = m.candidate.yearsExperience;
        if (years == null || !yearTerms.every((n) => years >= n)) return false;
      }
      if (textTerms.length) {
        const hay = haystack(m);
        if (!textTerms.every((term) => hay.includes(term))) return false;
      }
      return true;
    });

  matches.sort(
    (a, b) =>
      Number(b.candidate.starred) - Number(a.candidate.starred) ||
      a.candidate.name.localeCompare(b.candidate.name)
  );

  return matches.slice(0, limit);
}
