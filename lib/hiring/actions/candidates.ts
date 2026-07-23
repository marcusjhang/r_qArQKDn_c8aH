'use server';

// Candidate write actions (add / edit / star / move stage / set status). Part
// of the board's single write path — see ./index for the boundary contract.
//
// These are thin wrappers over the actor-scoped core in ../core, which both this
// web path and the MCP tools (app/api/mcp/route.ts) share — one write path, two
// front doors, so they can never drift. Each wrapper confirms the session
// (requireUser) and calls the core with the acting user; the core does the
// zod-parse + guard + placement + DB write and does not resolve auth. Neither
// side revalidates: the board is uncached and TanStack Query is the client's
// only cache (see ./index).

import { requireUser } from '@/lib/auth';
import type { Status } from '../types';
import {
  addCandidateCore,
  editCandidateCore,
  setCandidateStarredCore,
  moveStageCore,
  setStatusCore
} from '../core';

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

/**
 * Star / unstar a candidate. A purely visual highlight (starred candidates
 * float to the top of their column), so there's no favorites cap like jobs.
 */
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
