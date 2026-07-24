// Client-safe result shapes shared by the /settings server actions and the client
// panels, split out so the client can import them without the 'use server' module.

/** Success, or a caller-facing message the settings UI renders inline. */
export type SettingsResult = { ok: true } | { ok: false; error: string };

/** Result of minting an MCP API token: the full secret is returned exactly once, never again. */
export type CreateTokenResult =
  | { ok: true; token: string; command: string; prefix: string }
  | { ok: false; error: string };
