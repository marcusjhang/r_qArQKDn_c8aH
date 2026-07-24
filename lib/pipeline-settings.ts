import 'server-only';

// Pipeline settings read — the single `pipeline_settings` row holds the universal
// "warn after N days in a stage" threshold, with the default as a fallback.

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
