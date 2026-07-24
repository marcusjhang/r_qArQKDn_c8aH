import 'server-only';

// Current-account API-token read for /settings. Only non-secret fields are read
// back — the plaintext secret lives only in the mint response, never in the DB.

import { desc, eq } from 'drizzle-orm';
import { db, apiTokens } from '@/lib/db';
import { auth } from '@/lib/auth';

/** A token as shown in the settings list — never includes the secret or hash. */
export interface ApiTokenSummary {
  id: number;
  name: string;
  /** Leading display chars, e.g. `hpt_live_a1b2`. */
  prefix: string;
  /** ISO string, or null if never used. */
  lastUsedAt: string | null;
  /** ISO string, or null if the token never expires. */
  expiresAt: string | null;
}

/** The signed-in user's API tokens, newest first; empty when there is no session. */
export async function getApiTokens(): Promise<ApiTokenSummary[]> {
  const session = await auth();
  const userId = Number(session?.user?.id);
  if (!userId) return [];

  const rows = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      lastUsedAt: apiTokens.lastUsedAt,
      expiresAt: apiTokens.expiresAt
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null
  }));
}
