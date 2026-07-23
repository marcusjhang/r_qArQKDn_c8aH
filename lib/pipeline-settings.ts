import 'server-only';

// Pipeline settings read. The single `pipeline_settings` row is the source of
// truth for the one universal "warn after N days in a stage" threshold (managed
// from /settings, seeded in db/seed.ts); the board reads it through service.ts
// `loadStageWarnDays`, and the settings page reads it here to render the
// management control. Falls back to the default if the row is somehow missing
// (the seed always ensures one).

import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pipelineSettings } from '@/lib/schema/hiring';
import { DEFAULT_STAGE_WARN_DAYS } from '@/lib/hiring/primitives';

export async function getStageWarnDays(): Promise<number> {
  const [row] = await db
    .select({ stageWarnDays: pipelineSettings.stageWarnDays })
    .from(pipelineSettings)
    .orderBy(asc(pipelineSettings.id))
    .limit(1);
  return row?.stageWarnDays ?? DEFAULT_STAGE_WARN_DAYS;
}
