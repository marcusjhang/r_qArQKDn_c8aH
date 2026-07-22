import 'server-only';

// User directory reads for the Members section in /settings (RBAC role
// management). Mirrors lib/allowlist.ts. Writes go through the role-gated
// server action in app/(dashboard)/settings/actions.ts.

import { asc } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import type { Role } from '@/lib/rbac';

export type MemberRow = {
  id: number;
  name: string | null;
  email: string;
  role: Role;
};

export async function getUsers(): Promise<MemberRow[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role
    })
    .from(users)
    .orderBy(asc(users.email));
  return rows;
}
