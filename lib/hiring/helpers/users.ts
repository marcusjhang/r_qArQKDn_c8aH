// User / source lookups and the derived display forms (name, initials). Names are stored as discrete parts (see lib/schema/auth.ts); the combined label and initials are derived here, never stored.

import type { Source, User } from '../types';

/** Find a user in the board's user list by id (owner / feedback author). */
export function userById(users: User[], id: number): User | undefined {
  return users.find((u) => u.id === id);
}

/** Display name for a candidate's source id, falling back when unknown. */
export function sourceName(sources: Source[], id: number): string {
  return sources.find((s) => s.id === id)?.name ?? 'Unknown';
}

/** Resolve a user's numeric id from their email against the board's user list, or null when unknown. Client-side convenience only — the authoritative author is derived server-side. */
export function findUserIdByEmail(
  users: User[],
  email: string | null | undefined
): number | null {
  if (!email) return null;
  return users.find((u) => u.email === email)?.id ?? null;
}

/** The name fields the display helpers read — a structural subset of `User`, so an ad-hoc `{ firstName, lastName, email }` (e.g. a joined chat-author row) satisfies it without a dummy `id`. */
type NameParts = {
  firstName: string | null;
  lastName: string | null;
  email: string;
};

/** Human label for a user: first + last name joined, falling back to the email when neither is set. */
export function displayName(user: NameParts | undefined): string {
  if (!user) return 'Unknown';
  const full = [user.firstName, user.lastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ');
  return full || user.email;
}

/** Avatar initials from the display name: first letter of the first and last words (e.g. "Ben Ong" → "BO", single word → first two letters). */
export function initials(user: NameParts | undefined): string {
  const name = displayName(user);
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
