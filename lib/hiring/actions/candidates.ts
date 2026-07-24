'use server';

// Candidate write actions (add / edit / star / move stage / set status): thin wrappers that confirm the session (requireUser) and call the actor-scoped core in ../core, shared with the MCP tools. See ./index for the boundary contract.

import { inArray, sql } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { db, jobs, candidates, sources } from '@/lib/db';
import { terminalStage } from '../helpers';
import { DEFAULT_STAGES } from '../config';
import type { Status } from '../types';
import {
  addCandidateCore,
  editCandidateCore,
  setCandidateStarredCore,
  moveStageCore,
  setStatusCore
} from '../core';
import { importCandidatesSchema } from '../schemas';

// Normalize a name for case-insensitive matching (mirrors the `sources_name_lower_unique` index and ../import's resolver).
const normKey = (s: string) => s.trim().toLowerCase();

/** Returns the new candidate's id so the client can reconcile its optimistic row. */
export async function addCandidate(
  jobIdRaw: number,
  nameRaw: string,
  sourceRaw: number,
  ownerRaw: number,
  linkedinUrlRaw: string | null = null,
  githubUrlRaw: string | null = null,
  yearsExperienceRaw: number | null = null
): Promise<number | null> {
  // The client picks the owner in the form; the actor is the signed-in user.
  const actor = await requireUser();
  return addCandidateCore(actor, jobIdRaw, {
    name: nameRaw,
    source: sourceRaw,
    owner: ownerRaw,
    linkedinUrl: linkedinUrlRaw,
    githubUrl: githubUrlRaw,
    yearsExperience: yearsExperienceRaw
  });
}

/** Edit a candidate's core details (name, source, owner, profile links, years of experience). */
export async function editCandidate(
  idRaw: number,
  nameRaw: string,
  sourceRaw: number,
  ownerRaw: number,
  linkedinUrlRaw: string | null,
  githubUrlRaw: string | null,
  yearsExperienceRaw: number | null
) {
  const actor = await requireUser();
  await editCandidateCore(actor, idRaw, {
    name: nameRaw,
    source: sourceRaw,
    owner: ownerRaw,
    linkedinUrl: linkedinUrlRaw,
    githubUrl: githubUrlRaw,
    yearsExperience: yearsExperienceRaw
  });
}

/** Star / unstar a candidate (a visual highlight, so no favorites cap like jobs). */
export async function setCandidateStarred(idRaw: number, starred: boolean) {
  const actor = await requireUser();
  await setCandidateStarredCore(actor, idRaw, starred);
}

export async function moveStage(idRaw: number, stageRaw: string) {
  const actor = await requireUser();
  await moveStageCore(actor, idRaw, stageRaw);
}

export async function setStatus(idRaw: number, statusRaw: Status) {
  const actor = await requireUser();
  await setStatusCore(actor, idRaw, statusRaw);
}

/** Bulk-create candidates from a resolved CSV import, in one transaction: create any missing jobs/sources (re-validating client-resolved ids), then bulk-insert. Returns the inserted count. */
export async function importCandidates(
  rowsRaw: unknown
): Promise<{ inserted: number }> {
  await requireUser();
  const rows = importCandidatesSchema.parse(rowsRaw);
  if (rows.length === 0) return { inserted: 0 };

  let inserted = 0;
  await db.transaction(async (tx) => {
    // 1. Create jobs for rows that referenced a not-yet-existing title.
    const newJobTitles = new Map<string, string>(); // normKey -> canonical title
    for (const r of rows) {
      if (r.jobId == null) {
        const key = normKey(r.jobTitle);
        if (!newJobTitles.has(key)) newJobTitles.set(key, r.jobTitle.trim());
      }
    }
    const jobIdByTitle = new Map<string, number>();
    const stagesByJobId = new Map<number, string[]>();
    if (newJobTitles.size > 0) {
      const [{ maxPos }] = await tx
        .select({ maxPos: sql<number>`coalesce(max(${jobs.position}), -1)` })
        .from(jobs);
      let pos = Number(maxPos);
      for (const [key, title] of newJobTitles) {
        const [row] = await tx
          .insert(jobs)
          .values({ title, stages: [...DEFAULT_STAGES], position: ++pos })
          .returning({ id: jobs.id });
        jobIdByTitle.set(key, row.id);
        stagesByJobId.set(row.id, [...DEFAULT_STAGES]);
      }
    }

    // 2. Load the stage lists for existing target jobs, to default a row's stage to the job's first stage.
    const existingJobIds = [
      ...new Set(rows.map((r) => r.jobId).filter((id): id is number => id != null))
    ];
    if (existingJobIds.length > 0) {
      const found = await tx
        .select({ id: jobs.id, stages: jobs.stages })
        .from(jobs)
        .where(inArray(jobs.id, existingJobIds));
      for (const j of found) stagesByJobId.set(j.id, j.stages);
    }

    // 3. Create sources for rows that referenced a not-yet-existing name.
    const sourceIdByName = new Map<string, number>();
    const newSourceNames = new Map<string, string>();
    for (const r of rows) {
      if (r.source == null) {
        const key = normKey(r.sourceName);
        if (!newSourceNames.has(key)) newSourceNames.set(key, r.sourceName.trim());
      }
    }
    for (const [key, name] of newSourceNames) {
      // Reuse an existing case-insensitive match (covers a source added since the client's resolve), else insert.
      const [existing] = await tx
        .select({ id: sources.id })
        .from(sources)
        .where(sql`lower(${sources.name}) = ${key}`)
        .limit(1);
      if (existing) {
        sourceIdByName.set(key, existing.id);
        continue;
      }
      const [row] = await tx
        .insert(sources)
        .values({ name })
        .returning({ id: sources.id });
      sourceIdByName.set(key, row.id);
    }

    // 4. Assemble and bulk-insert the candidate rows.
    const values = rows.flatMap((r) => {
      const jobId = r.jobId ?? jobIdByTitle.get(normKey(r.jobTitle));
      const source = r.source ?? sourceIdByName.get(normKey(r.sourceName));
      if (jobId == null || source == null) return []; // unreachable given the above
      const stageList = stagesByJobId.get(jobId) ?? [...DEFAULT_STAGES];
      const terminal = terminalStage(stageList);
      let stage = r.stage && stageList.includes(r.stage) ? r.stage : stageList[0];
      let status = r.status;
      // Keep the (stage, status) coupling (see terminalStage): terminal stage means hired, and hired pulls into the terminal stage.
      if (stage === terminal) status = 'hired';
      else if (status === 'hired' && terminal !== undefined) stage = terminal;
      return [
        {
          jobId,
          name: r.name,
          stage,
          owner: r.owner,
          source,
          linkedinUrl: r.linkedinUrl,
          githubUrl: r.githubUrl,
          yearsExperience: r.yearsExperience,
          status
        }
      ];
    });

    if (values.length > 0) {
      await tx.insert(candidates).values(values);
      inserted = values.length;
    }
  });

  // No server-cache invalidation: the board is uncached, so the store resyncs itself after the import.
  return { inserted };
}
