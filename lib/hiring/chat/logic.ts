import 'server-only';

// Barrel for the chat read/write logic (./messages + ./notifications, shaping in
// ./shaping). Expressed against the injectable `ChatStore` seam so it's
// unit-testable without a DB; identity is passed in as an `email`, so this module
// never imports `@/lib/auth`.

export { loadThreadWith, postMessageWith } from './messages';
export {
  markNotificationReadWith,
  markAllNotificationsReadWith,
  dismissNotificationWith,
  dismissAllNotificationsWith,
  getNotificationsWith
} from './notifications';

// Re-export the production store as the default for callers that don't inject one.
export { drizzleChatStore } from './store';
