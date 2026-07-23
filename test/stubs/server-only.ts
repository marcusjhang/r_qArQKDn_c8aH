// Test stub for the `server-only` package.
//
// The real `server-only` module throws when imported outside a React Server
// Component, which would break unit tests that import server modules (e.g.
// `lib/hiring/core/service.ts`). Vitest aliases `server-only` to this empty module
// so those imports are inert under test. See `vitest.config.ts`.
export {};
