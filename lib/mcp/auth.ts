import 'server-only';

// Bearer-token authentication for the MCP endpoint (app/api/mcp/route.ts).
//
// Tokens are minted in /settings (see app/(dashboard)/settings/actions.ts) and
// stored hashed: only a SHA-256 digest and a short display prefix live in the
// `api_tokens` table, never the plaintext secret. Verification hashes the
// incoming bearer, looks the digest up, rejects an expired token, and bumps
// `lastUsedAt`. The resolved owner id is threaded to the MCP tools as the actor
// every write acts as (via AuthInfo.extra.userId).

import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { withMcpAuth } from 'mcp-handler';
import { db, apiTokens } from '@/lib/db';

// Public prefix on every secret so a leaked string is recognizably one of ours
// (and greppable in logs / secret scanners). `live` distinguishes it from any
// future `test` band.
const TOKEN_PREFIX = 'hpt_live_';
// Characters of the secret kept for display in the token list, e.g.
// `hpt_live_a1b2` — enough to tell tokens apart, too little to be useful alone.
const DISPLAY_PREFIX_LENGTH = TOKEN_PREFIX.length + 4;

/** SHA-256 hex digest of a token's plaintext — what we persist and match on. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A freshly minted token: the plaintext (shown once) plus what we persist. */
export interface MintedToken {
  /** The full secret — returned to the user exactly once, never stored. */
  token: string;
  /** SHA-256 digest stored for verification. */
  tokenHash: string;
  /** Leading characters stored for display. */
  prefix: string;
}

/**
 * Mint a new token. The plaintext is `hpt_live_` + 48 hex chars of CSPRNG
 * entropy; only its hash and display prefix are meant to be persisted.
 */
export function mintToken(): MintedToken {
  const token = TOKEN_PREFIX + randomBytes(24).toString('hex');
  return {
    token,
    tokenHash: hashToken(token),
    prefix: token.slice(0, DISPLAY_PREFIX_LENGTH)
  };
}

/**
 * Resolve a bearer token to its owning user, or `undefined` when it's missing,
 * unknown, or expired. On success bumps `lastUsedAt` and returns the MCP
 * `AuthInfo`, exposing the owner id to tool handlers via `extra.userId`.
 * Returning `undefined` makes `withMcpAuth` (required) emit a 401.
 */
async function authenticateToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const tokenHash = hashToken(bearerToken);
  const [row] = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row) return undefined;

  // Reject an expired token before it can act.
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return undefined;

  // Record use. Best-effort — a failed bump must not deny an otherwise valid
  // token.
  try {
    await db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, row.id));
  } catch {
    /* non-fatal */
  }

  return {
    token: bearerToken,
    clientId: `api_token:${row.id}`,
    scopes: [],
    expiresAt: row.expiresAt ? Math.floor(row.expiresAt.getTime() / 1000) : undefined,
    extra: { userId: row.userId, tokenId: row.id }
  };
}

/**
 * Wrap an MCP route handler so every request must carry a valid bearer token.
 * A missing/invalid/expired token short-circuits with 401 before any tool runs.
 */
export function withTokenAuth(
  handler: (req: Request) => Response | Promise<Response>
): (req: Request) => Promise<Response> {
  return withMcpAuth(handler, authenticateToken, { required: true });
}

/** The acting user id carried on an authenticated request's AuthInfo. */
export function actorUserIdFrom(authInfo: AuthInfo | undefined): number | null {
  const id = authInfo?.extra?.userId;
  return typeof id === 'number' ? id : null;
}
