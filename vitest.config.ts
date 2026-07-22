import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit-test config. Defaults to a Node environment (the hiring business logic
// is framework-free) and mirrors the `@/` path aliases from tsconfig.json so
// test files import the same specifiers as the app. `server-only` is aliased to
// an inert stub so server modules can be imported without a React Server
// runtime.
//
// The React store hook (lib/hiring/store.ts) needs a DOM, so its test file
// (test/unit/hiring-store.test.tsx) opts into a jsdom environment with a
// per-file `// @vitest-environment jsdom` docblock. That keeps every pure
// Node-only test running in Node while the single hook test gets a DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/unit/**/*.test.{ts,tsx}']
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
