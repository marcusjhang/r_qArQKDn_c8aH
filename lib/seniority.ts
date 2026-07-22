import 'server-only';

// Seniority bands read. The `seniority_bands` table is the source of truth for
// the years-of-experience → label mapping (managed from /settings, seeded in
// db/seed.ts); the board reads it through service.ts `loadBands`, and the
// settings page reads it here to render the management panel. Ordered high-to-
// low so the panel lists Senior → Junior.

import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { seniorityBands } from '@/lib/schema/hiring';

export async function getSeniorityBands(): Promise<
  { id: number; label: string; minYears: number }[]
> {
  return db
    .select({
      id: seniorityBands.id,
      label: seniorityBands.label,
      minYears: seniorityBands.minYears
    })
    .from(seniorityBands)
    .orderBy(desc(seniorityBands.minYears));
}
