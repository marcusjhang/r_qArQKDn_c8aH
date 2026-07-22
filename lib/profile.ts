import 'server-only';

// Current-account profile read. The signed-in user edits their first/last name
// from /settings (see the `updateProfile` action there). The settings page reads
// the current values here to prefill the form.

import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import { auth } from '@/lib/auth';

/** The editable name fields for the signed-in account. */
export interface Profile {
  firstName: string;
  lastName: string;
}

/**
 * Split a combined display name into first/last for accounts that predate the
 * discrete columns (e.g. sign-ups, which only set `name`): the last whitespace
 * word is the last name and everything before it the first name. This mirrors
 * how avatar initials read the name (first word + last word), so an unedited
 * name round-trips without changing how it renders.
 */
function splitName(name: string | null): Profile {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { firstName: '', lastName: '' };
  if (words.length === 1) return { firstName: words[0], lastName: '' };
  return {
    firstName: words.slice(0, -1).join(' '),
    lastName: words[words.length - 1]
  };
}

/**
 * The signed-in user's first/last name for the settings form. Prefers the
 * discrete columns; falls back to splitting `name` when they are unset. Returns
 * blanks when there is no session (the page is auth-gated, so that's defensive).
 */
export async function getProfile(): Promise<Profile> {
  const session = await auth();
  const id = Number(session?.user?.id);
  if (!id) return { firstName: '', lastName: '' };

  const [row] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      name: users.name
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!row) return { firstName: '', lastName: '' };
  if (row.firstName || row.lastName) {
    return { firstName: row.firstName ?? '', lastName: row.lastName ?? '' };
  }
  return splitName(row.name);
}
