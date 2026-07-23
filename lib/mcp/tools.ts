import 'server-only';

// MCP tool surface for the hiring board (groups A + B + C from the plan):
//   A — read:  get_board, search_candidates
//   B — write: add_candidate, edit_candidate, move_candidate, set_status,
//              set_candidate_starred
//   C — write: add_feedback (attributed to the token's user)
// Structural job/stage ops (group D) are intentionally not exposed.
//
// Every write maps 1:1 to an actor-scoped core function (lib/hiring/core.ts) —
// the same code the web server actions call — and persists straight to Postgres.
// The board's reads are uncached (TanStack Query is the client's only cache), so
// an open dashboard reflects an MCP change on its next board fetch; neither front
// door revalidates a server cache. All input flows through the shared zod
// schemas, and guard/validation failures come back as structured tool errors
// (isError:true) with a human-readable reason the model can act on, rather than
// opaque protocol errors.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getBoard } from '@/lib/hiring/service';
import { STATUSES } from '@/lib/hiring/primitives';
import type { Status } from '@/lib/hiring/types';
import {
  addCandidateCore,
  editCandidateCore,
  moveStageCore,
  setStatusCore,
  setCandidateStarredCore,
  addFeedbackCore
} from '@/lib/hiring/core';
import { actorUserIdFrom } from './auth';

/** MCP tool-call extra: carries the validated AuthInfo for the request. */
type ToolExtra = { authInfo?: AuthInfo };

// A loosely-typed view of `server.registerTool`. Registering through this avoids
// instantiating the SDK's very deep per-tool generic (which otherwise makes
// `tsc` OOM across eight tools); the SDK still validates `inputSchema` at
// runtime, and each handler annotates its own argument shape for local safety.
type ToolRegistrar = (
  name: string,
  config: {
    title?: string;
    description?: string;
    inputSchema?: Record<string, z.ZodTypeAny>;
  },
  cb: (args: never, extra: ToolExtra) => Promise<CallToolResult>
) => void;

function ok(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

function fail(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

// Translate a Postgres constraint violation into a clean, caller-safe sentence.
// Drizzle wraps the driver error (its `.message` is the raw "Failed query: …"
// SQL), so walk the `.cause` chain for the postgres.js error, which carries the
// SQLSTATE `code` and `constraint_name`. Returning a friendly string here also
// stops the raw SQL / table names from leaking back to the MCP caller.
function pgViolation(error: unknown): string | null {
  let e: unknown = error;
  while (e instanceof Error) {
    const code = (e as { code?: string }).code;
    const constraint = (e as { constraint_name?: string }).constraint_name;
    if (code === '23505') {
      // unique_violation
      if (constraint === 'feedback_candidate_by_user_unique') {
        return (
          'You have already left feedback on this candidate; edit the ' +
          'existing entry instead of adding a second one.'
        );
      }
      return 'That conflicts with an existing record (a unique value is already taken).';
    }
    if (code === '23503') {
      // foreign_key_violation
      return 'A referenced record (job, source, or user) does not exist.';
    }
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

/** Flatten any thrown error into an actionable, human-readable message. */
function reason(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((i) => i.message).join('; ');
  }
  return pgViolation(error) ?? (error instanceof Error ? error.message : String(error));
}

/** Resolve the acting user, or throw a clean error if the token didn't carry one. */
function requireActor(extra: ToolExtra): number {
  const actor = actorUserIdFrom(extra.authInfo);
  if (actor == null) throw new Error('Could not resolve the token owner.');
  return actor;
}

/** Register the read + write tool groups on an MCP server instance. */
export function registerHiringTools(server: McpServer): void {
  const reg = server.registerTool.bind(server) as unknown as ToolRegistrar;

  /* ---------- Group A: read ---------- */

  reg(
    'get_board',
    {
      title: 'Get board',
      description:
        'Read the whole hiring board: jobs (with their ordered stages), all ' +
        'candidates (with embedded feedback), plus the users, candidate sources, ' +
        'and seniority bands referenced by id. Use this first to see what you ' +
        'are acting on.',
      inputSchema: {}
    },
    async (): Promise<CallToolResult> => {
      const board = await getBoard();
      return ok(JSON.stringify(board, null, 2));
    }
  );

  reg(
    'search_candidates',
    {
      title: 'Search candidates',
      description:
        'Find candidates by any combination of stage, owner (a users.id), ' +
        'status, and a free-text query matched against the candidate name. ' +
        'Omit a filter to ignore it; with no filters, returns every candidate.',
      inputSchema: {
        stage: z
          .string()
          .optional()
          .describe('Exact stage name (case-insensitive), e.g. "Interview".'),
        owner: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Owner user id (see get_board → users).'),
        status: z
          .enum(STATUSES)
          .optional()
          .describe('One of: ' + STATUSES.join(', ') + '.'),
        q: z
          .string()
          .optional()
          .describe('Free-text substring matched against the candidate name.')
      }
    },
    async (args: {
      stage?: string;
      owner?: number;
      status?: Status;
      q?: string;
    }): Promise<CallToolResult> => {
      const board = await getBoard();
      const needle = args.q?.trim().toLowerCase();
      const wantStage = args.stage?.trim().toLowerCase();
      const matches = board.candidates.filter((c) => {
        if (wantStage && c.stage.toLowerCase() !== wantStage) return false;
        if (args.owner != null && c.owner !== args.owner) return false;
        if (args.status && c.status !== args.status) return false;
        if (needle && !c.name.toLowerCase().includes(needle)) return false;
        return true;
      });
      return ok(
        `${matches.length} candidate(s) matched.\n` +
          JSON.stringify(matches, null, 2)
      );
    }
  );

  /* ---------- Group B: candidate operations ---------- */

  reg(
    'add_candidate',
    {
      title: 'Add candidate',
      description:
        'Add a candidate to a job, placed in the job’s first stage. Owner ' +
        'defaults to you (the token owner) when omitted.',
      inputSchema: {
        jobId: z.number().int().positive().describe('Target job id.'),
        name: z.string().describe('Candidate name.'),
        source: z
          .number()
          .int()
          .positive()
          .describe('Source id (see get_board → sources).'),
        owner: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Owner user id; defaults to you when omitted.'),
        linkedinUrl: z.string().optional().describe('Optional LinkedIn URL.'),
        githubUrl: z.string().optional().describe('Optional GitHub URL.'),
        yearsExperience: z
          .number()
          .int()
          .optional()
          .describe('Optional whole years of experience.')
      }
    },
    async (
      args: {
        jobId: number;
        name: string;
        source: number;
        owner?: number;
        linkedinUrl?: string;
        githubUrl?: string;
        yearsExperience?: number;
      },
      extra: ToolExtra
    ): Promise<CallToolResult> => {
      try {
        const actor = requireActor(extra);
        const id = await addCandidateCore(actor, args.jobId, {
          name: args.name,
          source: args.source,
          owner: args.owner,
          linkedinUrl: args.linkedinUrl ?? null,
          githubUrl: args.githubUrl ?? null,
          yearsExperience: args.yearsExperience ?? null
        });
        if (id == null) return fail(`No job found with id ${args.jobId}.`);
        return ok(`Added candidate "${args.name}" (id ${id}).`);
      } catch (error) {
        return fail(reason(error));
      }
    }
  );

  reg(
    'edit_candidate',
    {
      title: 'Edit candidate',
      description:
        'Update a candidate’s core details. name and source are required; ' +
        'owner, the profile links, and years of experience are optional and ' +
        'left unchanged when omitted (pass null to clear a link or years).',
      inputSchema: {
        id: z.number().int().positive().describe('Candidate id.'),
        name: z.string().describe('Candidate name.'),
        source: z
          .number()
          .int()
          .positive()
          .describe('Source id (see get_board → sources).'),
        owner: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Owner user id; omit to leave the current owner unchanged.'),
        linkedinUrl: z
          .string()
          .nullish()
          .describe('LinkedIn URL; omit to leave unchanged, or null to clear.'),
        githubUrl: z
          .string()
          .nullish()
          .describe('GitHub URL; omit to leave unchanged, or null to clear.'),
        yearsExperience: z
          .number()
          .int()
          .nullish()
          .describe(
            'Whole years of experience; omit to leave unchanged, or null to clear.'
          )
      }
    },
    async (
      args: {
        id: number;
        name: string;
        source: number;
        owner?: number;
        linkedinUrl?: string | null;
        githubUrl?: string | null;
        yearsExperience?: number | null;
      },
      extra: ToolExtra
    ): Promise<CallToolResult> => {
      try {
        const actor = requireActor(extra);
        // Pass omitted fields through as `undefined` (not null) so the core
        // keeps their current values — a partial edit must not wipe links/years
        // or reassign the owner.
        const found = await editCandidateCore(actor, args.id, {
          name: args.name,
          source: args.source,
          owner: args.owner,
          linkedinUrl: args.linkedinUrl,
          githubUrl: args.githubUrl,
          yearsExperience: args.yearsExperience
        });
        if (!found) return fail(`No candidate found with id ${args.id}.`);
        return ok(`Updated candidate ${args.id}.`);
      } catch (error) {
        return fail(reason(error));
      }
    }
  );

  reg(
    'move_candidate',
    {
      title: 'Move candidate',
      description:
        'Move a candidate to a different stage of their job’s pipeline. ' +
        'Moving into the terminal "Hired" stage marks them hired; moving out of ' +
        'it clears a stale hired status.',
      inputSchema: {
        id: z.number().int().positive().describe('Candidate id.'),
        stage: z
          .string()
          .describe('Destination stage name (must exist on the job).')
      }
    },
    async (
      args: { id: number; stage: string },
      extra: ToolExtra
    ): Promise<CallToolResult> => {
      try {
        const actor = requireActor(extra);
        const placement = await moveStageCore(actor, args.id, args.stage);
        if (!placement) {
          // moveStageCore returns null for both "no such candidate" and "stage
          // isn't on the candidate's job" — disambiguate so a mis-cased or
          // unknown stage gets an actionable message instead of the model
          // wrongly concluding the candidate is gone.
          const board = await getBoard();
          const candidate = board.candidates.find((c) => c.id === args.id);
          if (!candidate) return fail(`No candidate found with id ${args.id}.`);
          const job = board.jobs.find((j) => j.id === candidate.jobId);
          const validStages = job?.stages ?? [];
          return fail(
            `"${args.stage}" is not a stage on that candidate’s job. ` +
              `Valid stages: ${validStages.join(', ')}.`
          );
        }
        return ok(
          `Moved candidate ${args.id} to "${placement.stage}" ` +
            `(status: ${placement.status}).`
        );
      } catch (error) {
        return fail(reason(error));
      }
    }
  );

  reg(
    'set_status',
    {
      title: 'Set candidate status',
      description:
        'Set a candidate’s status. Setting "hired" moves them into the ' +
        'terminal Hired stage when the job has one.',
      inputSchema: {
        id: z.number().int().positive().describe('Candidate id.'),
        status: z
          .enum(STATUSES)
          .describe('One of: ' + STATUSES.join(', ') + '.')
      }
    },
    async (
      args: { id: number; status: Status },
      extra: ToolExtra
    ): Promise<CallToolResult> => {
      try {
        const actor = requireActor(extra);
        const placement = await setStatusCore(actor, args.id, args.status);
        if (!placement) return fail(`No candidate found with id ${args.id}.`);
        return ok(
          `Set candidate ${args.id} status to "${placement.status}" ` +
            `(stage: ${placement.stage}).`
        );
      } catch (error) {
        return fail(reason(error));
      }
    }
  );

  reg(
    'set_candidate_starred',
    {
      title: 'Star / unstar candidate',
      description:
        'Star or unstar a candidate. Starred candidates float to the top of ' +
        'their column as highlighted standouts.',
      inputSchema: {
        id: z.number().int().positive().describe('Candidate id.'),
        starred: z.boolean().describe('true to star, false to unstar.')
      }
    },
    async (
      args: { id: number; starred: boolean },
      extra: ToolExtra
    ): Promise<CallToolResult> => {
      try {
        const actor = requireActor(extra);
        const found = await setCandidateStarredCore(
          actor,
          args.id,
          args.starred
        );
        if (!found) return fail(`No candidate found with id ${args.id}.`);
        return ok(
          `${args.starred ? 'Starred' : 'Unstarred'} candidate ${args.id}.`
        );
      } catch (error) {
        return fail(reason(error));
      }
    }
  );

  /* ---------- Group C: feedback ---------- */

  reg(
    'add_feedback',
    {
      title: 'Add feedback',
      description:
        'Leave feedback on a candidate: a 1–4 rating (1 = Strong No, 2 = ' +
        'No, 3 = Yes, 4 = Strong Yes) and an optional note. Attributed to you ' +
        '(the token owner) — one entry per person per candidate.',
      inputSchema: {
        id: z.number().int().positive().describe('Candidate id.'),
        rating: z
          .number()
          .int()
          .describe('1 = Strong No, 2 = No, 3 = Yes, 4 = Strong Yes.'),
        note: z.string().optional().describe('Optional free-text note.')
      }
    },
    async (
      args: { id: number; rating: number; note?: string },
      extra: ToolExtra
    ): Promise<CallToolResult> => {
      try {
        const actor = requireActor(extra);
        const feedbackId = await addFeedbackCore(
          actor,
          args.id,
          args.rating,
          args.note ?? ''
        );
        if (feedbackId == null) {
          return fail(`No candidate found with id ${args.id}.`);
        }
        return ok(
          `Recorded feedback (rating ${args.rating}) on candidate ${args.id}.`
        );
      } catch (error) {
        // reason() maps the one-entry-per-person unique violation (and other
        // Postgres constraint errors) to a clean, caller-safe message.
        return fail(reason(error));
      }
    }
  );
}
