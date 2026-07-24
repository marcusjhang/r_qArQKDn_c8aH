import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Integration-test config: specs talk to a REAL Postgres via the rollback
// harness (test/integration/helpers/db.ts), run with `bun run test:integration`,
// and skip themselves when no database is configured (test/env.ts).
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
      // Mirror vitest.config.ts: inert `server-only` stub + the `@/` aliases.
      'server-only': fileURLToPath(
        new URL('./test/stubs/server-only.ts', import.meta.url)
      ),
      '@/lib': fileURLToPath(new URL('./lib', import.meta.url)),
      '@/components': fileURLToPath(new URL('./components', import.meta.url))
    }
  }
});
