import 'server-only';

// Stage time-limits (SLAs) read. The `stage_slas` table is the source of truth
// for the "warn after N days in a stage" mapping (managed from /settings,
// seeded in db/seed.ts); the board reads it through service.ts `loadStageSlas`,
// and the settings page reads it here to render the management panel. Ordered
// by stage name for a stable, predictable list.

import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { stageSlas } from '@/lib/schema/hiring';

export async function getStageSlas(): Promise<
  { id: number; stage: string; maxDays: number }[]
> {
  return db
    .select({
      id: stageSlas.id,
      stage: stageSlas.stage,
      maxDays: stageSlas.maxDays
    })
    .from(stageSlas)
    .orderBy(asc(stageSlas.stage));
}
