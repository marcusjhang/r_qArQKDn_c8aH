import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Options as PostgresOptions } from 'postgres';
import * as schema from './schema';

export { users, allowedEmails, apiTokens } from './schema';
export { rateLimitHits } from './schema';
export { jobs, candidates, feedback, sources, messages, mentions } from './schema';

/**
 * Build a Drizzle client for an explicit connection string, so a test can point
 * at an isolated database without the module-level `DATABASE_URL` read. The full
 * schema (incl. relations) is passed so the `db.query` API is available.
 */
export function createDb(
  connectionString: string,
  options?: PostgresOptions<Record<string, never>>
) {
  return drizzle(postgres(connectionString, options), { schema });
}

// The app singleton, constructed on first use rather than at module load, so
// merely importing this module (or a missing `DATABASE_URL`) never opens a
// connection until a query actually runs.
let singleton: ReturnType<typeof createDb> | null = null;

function resolveDb(): ReturnType<typeof createDb> {
  if (singleton) return singleton;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. ' +
        'Add it to your .env.local file (see .env.example) or set it in your deployment environment.'
    );
  }
  singleton = createDb(databaseUrl);
  return singleton;
}

/**
 * The one app-wide client, wired to `DATABASE_URL` and proxied to a lazily-built
 * Drizzle client (methods bound to the real client). Caveat: `bind` drops a
 * callable's own methods, so for raw `$client` access go through `createDb`.
 */
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop) {
    const real = resolveDb();
    const value = Reflect.get(real, prop) as unknown;
    return typeof value === 'function' ? value.bind(real) : value;
  }
});
