// Client-safe result type for the Settings server actions.
//
// Defined here (under lib/, importable as @/lib/settings-types) so the
// server actions file and all settings UI components share one declaration —
// following the same split as lib/members-types.ts.  The @/app/* tree is not
// path-aliased, so the canonical definition lives here rather than next to
// the actions.

/** Success, or a caller-facing message the settings UI renders inline. */
export type SettingsResult = { ok: true } | { ok: false; error: string };
