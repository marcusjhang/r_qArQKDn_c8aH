// Pure helpers for resolving and labelling users and sources. Names are stored
// as discrete parts (see lib/schema/auth.ts); the combined display forms are
// derived here, never persisted.

import type { Source, User } from '../model/types';

/** Find a user in the board's user list by id (owner / feedback author). */
export function userById(users: User[], id: number): User | undefined {
  return users.find((u) => u.id === id);
}

/** Display name for a candidate's source id, falling back when unknown. */
export function sourceName(sources: Source[], id: number): string {
  return sources.find((s) => s.id === id)?.name ?? 'Unknown';
}

/** The name fields display helpers read — a structural subset of `User`, so
 * both a full board `User` and an ad-hoc `{ firstName, lastName, email }` (e.g.
 * a joined chat-author row) satisfy it without a dummy `id`. */
type NameParts = {
  firstName: string | null;
  lastName: string | null;
  email: string;
};

/**
 * Human label for a user: their first and last name joined, falling back to the
 * email when neither is set. The name is stored as discrete parts (see
 * lib/schema/auth.ts); the combined form is derived here, never stored.
 */
export function displayName(user: NameParts | undefined): string {
  if (!user) return 'Unknown';
  const full = [user.firstName, user.lastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ');
  return full || user.email;
}

/**
 * Avatar initials for a user, derived from the display name: first letter of
 * the first and last words (e.g. "Ben Ong" → "BO", "Heng Hong Lee" → "HL",
 * single word → first two letters). Derived, never stored.
 */
export function initials(user: NameParts | undefined): string {
  const name = displayName(user);
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
