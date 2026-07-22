// Barrel for the domain-segregated Drizzle schema. Splitting the tables into
// `auth.ts` and `hiring.ts` keeps each domain self-contained, while this index
// preserves the single `@/lib/schema` import surface that `lib/db.ts`,
// `drizzle.config.ts`, and the migration/seed scripts consume. Re-exporting the
// relations here too keeps the `db.query` relational API fully wired.

export * from './auth';
export * from './hiring';
