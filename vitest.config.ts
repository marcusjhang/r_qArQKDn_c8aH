import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit-test config. Runs in a Node environment (the hiring business logic is
// framework-free) and mirrors the `@/` path aliases from tsconfig.json so test
// files import the same specifiers as the app. `server-only` is aliased to an
// inert stub so server modules can be imported without a React Server runtime.
export default defineConfig({
  test: {
    environment: 'node',
    // Pure logic tests run in Node (the config default); the one hook test
    // opts into jsdom via a per-file `// @vitest-environment jsdom` docblock
    // (vitest 4 removed environmentMatchGlobs). Include .tsx so it's picked up.
    include: ['test/unit/**/*.test.{ts,tsx}'],
    coverage: {
      // v8 native coverage. Report the framework-free business logic in `lib/`
      // (what the unit suite actually exercises); UI, generated, and config
      // files that the Node-environment suite can't drive are excluded so the
      // numbers reflect real, testable code rather than being diluted by
      // untestable surface area.
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        '**/*.config.*',
        'lib/schema/**',
        'lib/**/types.ts'
      ]
      // No threshold gate: the existing suite covers a subset of `lib/`, so
      // enforcing a high bar would fail CI today. Kept ungated intentionally.
    }
  },
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL('./test/stubs/server-only.ts', import.meta.url)
      ),
      '@/lib': fileURLToPath(new URL('./lib', import.meta.url)),
      '@/components': fileURLToPath(new URL('./components', import.meta.url))
    }
  }
});
