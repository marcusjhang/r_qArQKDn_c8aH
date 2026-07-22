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
 * The signed-in user's first/last name for the settings form. Returns blanks
 * when a field is unset or there is no session (the page is auth-gated, so the
 * no-session case is defensive).
 */
export async function getProfile(): Promise<Profile> {
  const session = await auth();
  const id = Number(session?.user?.id);
  if (!id) return { firstName: '', lastName: '' };

  const [row] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return { firstName: row?.firstName ?? '', lastName: row?.lastName ?? '' };
}
