// Client-side profile-link (LinkedIn / GitHub) validation, mirroring the server's zProfileUrl rule so the two can't drift.

/** Max length of a profile URL (kept in sync with the zProfileUrl bound). */
export const MAX_PROFILE_URL = 500;

/** Placeholder hints for the optional profile-link inputs, shared by the add- and edit-candidate forms. */
export const LINKEDIN_URL_PLACEHOLDER = 'https://www.linkedin.com/in/…';
export const GITHUB_URL_PLACEHOLDER = 'https://github.com/…';

/** Mirror of the server's zProfileUrl rule: blank is a valid "no link" (→ null); anything else must be an http(s) URL of at most MAX_PROFILE_URL chars. */
export function normalizeProfileUrl(raw: string): {
  ok: boolean;
  value: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > MAX_PROFILE_URL || !/^https?:\/\//i.test(trimmed)) {
    return { ok: false, value: null };
  }
  try {
    new URL(trimmed);
    return { ok: true, value: trimmed };
  } catch {
    return { ok: false, value: null };
  }
}
