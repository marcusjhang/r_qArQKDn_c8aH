// Unit coverage for the lazy `db` singleton in lib/db.ts: a Proxy built on first
// property access, so importing the module never reads DATABASE_URL or connects.
// Pins that contract — import is side-effect-free, the missing-URL error defers
// to first use, and once a URL is set the Proxy forwards to a real Drizzle client.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Well-formed but unreachable; postgres.js is lazy, so no socket is opened
// unless a query actually runs (these tests never issue one).
const DUMMY_URL = 'postgresql://user:pass@localhost:5432/nonexistent';

describe('lib/db lazy singleton', () => {
  const original = process.env.DATABASE_URL;

  beforeEach(() => {
    // Re-evaluate lib/db per test so its module-scoped singleton starts unset.
    vi.resetModules();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  it('imports without a database configured', async () => {
    delete process.env.DATABASE_URL;
    // Importing must not read DATABASE_URL or connect — it only becomes
    // required when the singleton is actually used.
    await expect(import('@/lib/db')).resolves.toHaveProperty('db');
  });

  it('defers the missing-DATABASE_URL error to first use of the singleton', async () => {
    delete process.env.DATABASE_URL;
    const { db } = await import('@/lib/db');
    // The throw fires on the first property access, not at import.
    expect(() => db.select).toThrow(/DATABASE_URL is not set/);
  });

  it('forwards to a real Drizzle client once DATABASE_URL is set', async () => {
    process.env.DATABASE_URL = DUMMY_URL;
    const { db, jobs } = await import('@/lib/db');

    // Every method the app calls on the singleton resolves through the Proxy.
    const methods = [
      'select',
      'insert',
      'update',
      'delete',
      'execute',
      'transaction'
    ] as const;
    for (const method of methods) {
      expect(typeof db[method]).toBe('function');
    }
    // `db.query` is the relational API — a data property (object), not a method.
    expect(db.query).toBeTypeOf('object');

    // Prove a bound method actually drives the real query builder: compiling a
    // SELECT to SQL exercises `this` end-to-end and needs no live connection.
    const { sql } = db.select().from(jobs).toSQL();
    expect(sql.toLowerCase()).toContain('select');
    expect(sql).toContain('jobs');
  });
});
