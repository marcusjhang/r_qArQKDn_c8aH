// Client-safe result shape shared by the /settings server actions and the
// client panels (and the editable-list hook) that call them. Split into its own
// module — the same pattern as lib/members-types.ts — so the client components
// can import it without pulling the 'use server' actions module into their
// bundle, and so the `{ ok } | { ok; error }` shape is declared exactly once.

/** Success, or a caller-facing message the settings UI renders inline. */
export type SettingsResult = { ok: true } | { ok: false; error: string };

/**
 * Result of minting an MCP API token: on success the full secret is returned
 * exactly once, alongside a ready-to-paste `claude mcp add` command. The secret
 * is never retrievable again — only its hash and display prefix are persisted.
 */
export type CreateTokenResult =
  | { ok: true; token: string; command: string; prefix: string }
  | { ok: false; error: string };
