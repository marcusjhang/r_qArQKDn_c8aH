import 'server-only';

// Candidate sources read. The `sources` table is the source of truth for the
// candidate-source picklist (managed from /settings, seeded in db/seed.ts); the
// board reads it through service.ts `loadSources`, and the settings page reads
// it here to render the management panel.

import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sources } from '@/lib/schema/hiring';

export async function getSources(): Promise<{ id: number; name: string }[]> {
  return db
    .select({ id: sources.id, name: sources.name })
    .from(sources)
    .orderBy(asc(sources.name));
}
