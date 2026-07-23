import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Integration-test config. These specs talk to a REAL Postgres via the harness
// in test/integration/helpers/db.ts (transaction-rollback isolation), so they
// are a separate suite from the pure, DB-free unit tests in `vitest.config.ts`
// and are run explicitly with `bun run test:integration`. When no database is
// configured the specs skip themselves (see test/env.ts `hasTestDatabase`), so
// this suite is safe to run anywhere.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    // One database connection is shared across the suite (harness uses max: 1),
    // so run files serially to keep the rollback transactions from contending.
    fileParallelism: false,
    // A round-trip to Postgres is slower than a pure unit test; give it room.
    testTimeout: 20_000,
    hookTimeout: 20_000
  },
  resolve: {
    alias: {
      // Mirror vitest.config.ts: inert `server-only` stub + the `@/` aliases so
      // integration specs import the same specifiers as the app.
      'server-only': fileURLToPath(
        new URL('./test/stubs/server-only.ts', import.meta.url)
      ),
      '@/lib': fileURLToPath(new URL('./lib', import.meta.url)),
      '@/components': fileURLToPath(new URL('./components', import.meta.url))
    }
  }
});
