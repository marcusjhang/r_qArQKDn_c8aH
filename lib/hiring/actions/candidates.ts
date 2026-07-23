'use server';

// Candidate write actions (add / edit / star / move stage / set status). Part
// of the board's single write path — see ./index for the boundary contract.
// The stage/status writes go through the shared pure placement helpers so the
// optimistic store and the server compute the same coupled (stage, status).

import { eq, inArray, sql } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { db, jobs, candidates, sources } from '@/lib/db';
import { placeInStage, placeWithStatus, terminalStage } from '../helpers';
import { DEFAULT_STAGES } from '../config';
import type { Status } from '../types';
import {
  zId,
  zStatus,
  zStageName,
  candidateInsertSchema,
  candidateEditSchema,
  importCandidatesSchema
} from '../schemas';
import { loadJobStages } from './support';

// Normalize a name for the case-insensitive matching the import uses (mirrors
// the `sources_name_lower_unique` index and the resolver in ../import).
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
  await requireUser();
  const jobId = zId.parse(jobIdRaw);
  const { name, source, owner, linkedinUrl, githubUrl, yearsExperience } =
    candidateInsertSchema.parse({
      name: nameRaw,
      source: sourceRaw,
      owner: ownerRaw,
      linkedinUrl: linkedinUrlRaw,
      githubUrl: githubUrlRaw,
      yearsExperience: yearsExperienceRaw
    });
  const stages = await loadJobStages(jobId);
  if (!stages) return null;
  const [row] = await db
    .insert(candidates)
    .values({
      jobId,
      name,
      stage: stages[0],
      owner,
      source,
      linkedinUrl,
      githubUrl,
      yearsExperience,
      status: 'active'
    })
    .returning({ id: candidates.id });
  return row?.id ?? null;
}

/**
 * Edit a candidate's core details: name, source, owner, the profile links, and
 * years of experience (which drives the seniority band).
 */
export async function editCandidate(
  idRaw: number,
  nameRaw: string,
  sourceRaw: number,
  ownerRaw: number,
  linkedinUrlRaw: string | null,
  githubUrlRaw: string | null,
  yearsExperienceRaw: number | null
) {
  await requireUser();
  const id = zId.parse(idRaw);
  const { name, source, owner, linkedinUrl, githubUrl, yearsExperience } =
    candidateEditSchema.parse({
      name: nameRaw,
      source: sourceRaw,
      owner: ownerRaw,
      linkedinUrl: linkedinUrlRaw,
      githubUrl: githubUrlRaw,
      yearsExperience: yearsExperienceRaw
    });
  await db
    .update(candidates)
    .set({ name, source, owner, linkedinUrl, githubUrl, yearsExperience })
    .where(eq(candidates.id, id));
}

/**
 * Star / unstar a candidate. A purely visual highlight (starred candidates
 * float to the top of their column), so there's no favorites cap like jobs.
 */
export async function setCandidateStarred(idRaw: number, starred: boolean) {
  await requireUser();
  const id = zId.parse(idRaw);
  await db
    .update(candidates)
    .set({ starred: !!starred })
    .where(eq(candidates.id, id));
}

export async function moveStage(idRaw: number, stageRaw: string) {
  await requireUser();
  const id = zId.parse(idRaw);
  const stage = zStageName.parse(stageRaw);
  // Only the placement inputs are read — jobId (to load the stage list) and the
  // current stage/status that placeInStage keys off — so project to those three
  // columns instead of a SELECT * of the whole candidate row.
  const [c] = await db
    .select({
      jobId: candidates.jobId,
      stage: candidates.stage,
      status: candidates.status
    })
    .from(candidates)
    .where(eq(candidates.id, id))
    .limit(1);
  if (!c) return;
  // Resolve "terminal" structurally (last stage), so auto-hire survives a rename.
  const stages = (await loadJobStages(c.jobId)) ?? [];
  // Guard stage membership: the client only ever moves a card into one of its
  // job's stages, but this action is the sole write path and can't trust that.
  // Without the check a stray stage would strand the card in a non-existent
  // column (no board column renders it), and a stray terminal stage would
  // wrongly flip the status to hired (see placeInStage).
  if (!stages.includes(stage)) return;
  const placement = placeInStage(stage, c, stages);
  await db.update(candidates).set(placement).where(eq(candidates.id, id));
}

export async function setStatus(idRaw: number, statusRaw: Status) {
  await requireUser();
  const id = zId.parse(idRaw);
  const status = zStatus.parse(statusRaw);
  // Same projection as moveStage: placeWithStatus only needs the current stage
  // (and jobId to load the stage list), so avoid a SELECT * of the row.
  const [c] = await db
    .select({
      jobId: candidates.jobId,
      stage: candidates.stage,
      status: candidates.status
    })
    .from(candidates)
    .where(eq(candidates.id, id))
    .limit(1);
  if (!c) return;
  // Setting status to Hired moves the card into the Hired stage if one exists.
  const stages = status === 'hired' ? await loadJobStages(c.jobId) : null;
  const placement = placeWithStatus(status, c, stages ?? []);
  await db.update(candidates).set(placement).where(eq(candidates.id, id));
}

/**
 * Bulk-create candidates from a resolved CSV import (see lib/hiring/import.ts
 * for the client-side resolution and lib/hiring/schemas.ts for the row schema).
 * Runs in a single transaction: create any jobs whose title didn't match an
 * existing one (with the default stages), create any sources that didn't match
 * (case-insensitively, reusing an existing row on a race), then bulk-insert the
 * candidates. Ids resolved on the client are re-validated by zod and re-derived
 * here — the client's preview never bypasses the server. Returns how many
 * candidates were inserted so the dialog can report a summary.
 */
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

    // 2. Load the stage lists for the existing jobs we'll insert into, so we can
    // default a row's stage to the job's first stage.
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
      // Reuse an existing row that matches case-insensitively (covers a source
      // added between the client's resolve and this write), else insert.
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
      // Keep the board's (stage, status) coupling, resolved structurally by
      // position (see terminalStage): landing in the terminal stage means hired,
      // and a hired status pulls into the terminal stage.
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

  // No server-cache invalidation: the board is uncached and TanStack Query is
  // the client's only cache, so the store resyncs itself after the import.
  return { inserted };
}
