import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

// Flat-config (ESLint 9) wrapper around the eslintrc-style `eslint-config-next`
// preset. FlatCompat translates Next's `core-web-vitals` + TypeScript shareable
// configs into the flat format ESLint 9 expects. This mirrors the setup that
// `create-next-app` emits for the Next 15 / ESLint 9 combination.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname
});

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'drizzle/**',
      'next-env.d.ts',
      'test/stubs/**'
    ]
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // Leading-underscore identifiers are an intentional "declared but not read"
    // marker in this repo (e.g. the `_*Conforms` compile-time schema-drift
    // guards in service.ts, which exist only to be type-checked). Honour that
    // convention so deliberate placeholders don't register as lint noise.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ]
    }
  },
  {
    // Shadcn UI primitives in `components/ui/**` are generated boilerplate kept
    // as-authored so future `shadcn add` runs stay diffable. Their idiomatic
    // shapes (an empty interface that only re-exports its supertype, a
    // permissive `formAction` typing) trip two strict rules that don't reflect
    // real defects, so they're relaxed for this vendored surface only.
    files: ['components/ui/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    // Tailwind's config is CommonJS by convention; loading the animate plugin
    // via `require()` is the documented pattern.
    files: ['tailwind.config.ts', 'postcss.config.*'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
];

export default eslintConfig;
