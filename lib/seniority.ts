import 'server-only';

// Seniority bands read — the years-of-experience → label mapping, ordered
// high-to-low so the settings panel lists Senior → Junior.

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
