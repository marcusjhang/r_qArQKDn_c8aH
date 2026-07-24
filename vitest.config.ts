import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit-test config: Node environment, mirrors the `@/` tsconfig aliases, and
// aliases `server-only` to an inert stub so server modules import under test.
export default defineConfig({
  test: {
    environment: 'node',
    // Include .tsx so the one hook test (which opts into jsdom via a per-file
    // docblock — vitest 4 removed environmentMatchGlobs) is picked up.
    include: ['test/unit/**/*.test.{ts,tsx}'],
    coverage: {
      // Report only the framework-free `lib/` logic the Node suite can drive;
      // UI/generated/config files are excluded below.
      provider: 'v8',
      reporter: ['text'],
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        '**/*.config.*',
        'lib/schema/**',
        'lib/**/types.ts'
      ]
      // No threshold gate: the suite covers only a subset of `lib/` today.
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
