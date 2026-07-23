// Single client-safe entry point for the hiring domain.
//
// Components and other UI-layer code should import everything hiring-related
// from `@/lib/hiring` rather than reaching into individual sub-modules — one
// predictable import path for constants, helpers, types, and the client store.
// The domain is grouped into feature sub-directories (`core/`, `store/`,
// `chat/`, `model/`, `helpers/`); this barrel hides that layout from consumers.
//
// Deliberately EXCLUDED from this barrel:
//  - `core/service.ts` and `core/schemas.ts` carry `import 'server-only'`;
//    re-exporting them here would break the build for any client component that
//    imports `@/lib/hiring`.
//  - `core/actions.ts` (`'use server'`) is imported directly by the store;
//    routing it through this barrel would create a circular dependency
//    (index → store → actions → index). Server code keeps its sibling imports.
//
// Types are still re-exported as `import type` sources, so they never enter the
// client bundle.

export * from './model/config';
export * from './helpers';
export * from './model/types';
export * from './store/store';
