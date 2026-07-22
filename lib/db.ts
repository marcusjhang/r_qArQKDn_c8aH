import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Options as PostgresOptions } from 'postgres';
import * as schema from './schema';

export { users, allowedEmails, apiTokens } from './schema';
export { rateLimitHits } from './schema';
export { jobs, candidates, feedback, messages, mentions } from './schema';

/**
 * Build a Drizzle client for an explicit connection string. Factored out of the
 * app singleton below so a test can construct a client against an ISOLATED
 * database (see test/integration/helpers/db.ts) without depending on the
 * module-level `DATABASE_URL` read — the coupling that made database access hard
 * to exercise in isolation. The full schema (incl. relations) is passed so the
 * `db.query` relational API is available on the returned client.
 */
export function createDb(
  connectionString: string,
  options?: PostgresOptions<Record<string, never>>
) {
  return drizzle(postgres(connectionString, options), { schema });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. ' +
      'Add it to your .env.local file (see .env.example) or set it in your deployment environment.'
  );
}

// The one app-wide client, wired to DATABASE_URL. Import this singleton (and the
// tables re-exported above) everywhere in the app; use `createDb` only in tests.
export const db = createDb(databaseUrl);
