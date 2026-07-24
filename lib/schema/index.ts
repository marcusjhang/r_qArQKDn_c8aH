// Barrel for the domain-segregated Drizzle schema, preserving the single
// `@/lib/schema` import surface (tables + relations, so `db.query` stays wired).

export * from './auth';
export * from './hiring';
export * from './rate-limit';
