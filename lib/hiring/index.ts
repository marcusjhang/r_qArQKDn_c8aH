// Single client-safe entry point for the hiring domain.
//
// Components and other UI-layer code should import everything hiring-related
// from `@/lib/hiring` rather than reaching into individual sub-modules — one
// predictable import path for constants, helpers, types, and the client store.
//
// Deliberately EXCLUDED from this barrel:
//  - `queries.ts` and `schemas.ts` carry `import 'server-only'`; re-exporting
//    them here would break the build for any client component that imports
//    `@/lib/hiring`.
//  - `actions.ts` (`'use server'`) is imported directly by the store; routing
//    it through this barrel would create a circular dependency
//    (index → store → actions → index). Server code keeps its sibling imports.
//
// Types are still re-exported as `import type` sources, so they never enter the
// client bundle.

export * from './config';
export * from './helpers';
export * from './types';
export * from './store';
