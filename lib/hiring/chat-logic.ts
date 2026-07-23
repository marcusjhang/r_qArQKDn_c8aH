import 'server-only';

// Barrel for the chat read/write logic, split by concern into ./chat-messages
// (the per-candidate thread) and ./chat-notifications (the mention inbox), with
// the shared shaping/identity primitives in ./chat-shaping. All of it is
// expressed against an injectable `ChatStore` seam (see ./chat-store) rather
// than the `db` singleton — so it is unit-testable in a plain Node environment
// with an in-memory fake, and importing it never constructs the postgres
// client. The thin `'use server'` adapters in ./chat-actions call these with
// the Drizzle-backed store (the default); the server component's notification
// read (./chat-queries) calls `getNotificationsWith` likewise.
//
// The current-user identity is passed in as an `email` (resolved from the auth
// session by the caller) — this module never imports `@/lib/auth`, keeping the
// logic free of the request-scoped session so tests can drive it directly.
//
// Re-exports the same surface the callers and chat-logic.test.ts import, so the
// split is invisible to them.

export { loadThreadWith, postMessageWith } from './chat-messages';
export {
  markNotificationReadWith,
  markAllNotificationsReadWith,
  dismissNotificationWith,
  dismissAllNotificationsWith,
  getNotificationsWith
} from './chat-notifications';

// Re-export the production store as the default so callers that don't inject
// one still get the Drizzle-backed implementation.
export { drizzleChatStore } from './chat-store';
