import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Options as PostgresOptions } from 'postgres';
import * as schema from './schema';

export { users, allowedEmails } from './schema';
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

// The app singleton, constructed on first use rather than at module load.
//
// `createDb` (and the postgres connection it opens) is deferred until something
// actually reads a property off `db`, so merely IMPORTING this module — for the
// table objects re-exported above, or from a unit/integration spec that only
// touches `createDb` — never requires a database. A missing `DATABASE_URL` now
// surfaces the moment a query runs, not the moment any consumer is imported,
// which is what let a DB-less import (e.g. an integration suite that skips
// itself) crash the whole file at collection time.
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
 * The one app-wide client, wired to `DATABASE_URL`. Import this singleton (and
 * the tables re-exported above) everywhere in the app; use `createDb` only in
 * tests. Access is proxied to a lazily-built Drizzle client — methods are bound
 * to the real client so `this` (and any private state) resolves correctly.
 */
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop) {
    const real = resolveDb();
    const value = Reflect.get(real, prop) as unknown;
    return typeof value === 'function' ? value.bind(real) : value;
  }
});
