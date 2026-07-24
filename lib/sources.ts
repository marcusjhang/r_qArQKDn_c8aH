import 'server-only';

// Candidate sources read — the `sources` table backing the candidate-source picklist.

import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sources } from '@/lib/schema/hiring';

export async function getSources(): Promise<{ id: number; name: string }[]> {
  return db
    .select({ id: sources.id, name: sources.name })
    .from(sources)
    .orderBy(asc(sources.name));
}
