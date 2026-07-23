import { auth } from '@/lib/auth';
import { getSources } from '@/lib/sources';
import { getSeniorityBands } from '@/lib/seniority';
import { getStageWarnDays } from '@/lib/pipeline-settings';
import {
  MAX_YEARS_EXPERIENCE,
  MAX_STAGE_WARN_DAYS
} from '@/lib/hiring/primitives';
import { getProfile } from '@/lib/profile';
import { getApiTokens } from '@/lib/tokens';
import SettingsView from '@/components/settings/SettingsView';
import {
  updateProfile,
  addSource,
  renameSource,
  removeSource,
  addBand,
  updateBand,
  removeBand,
  updateStageWarnDays,
  createApiToken,
  revokeApiToken
} from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [sources, bands, stageWarnDays, profile, tokens, session] =
    await Promise.all([
      getSources(),
      getSeniorityBands(),
      getStageWarnDays(),
      getProfile(),
      getApiTokens(),
      auth()
    ]);
  return (
    <SettingsView
      sources={sources}
      bands={bands}
      stageWarnDays={stageWarnDays}
      maxYears={MAX_YEARS_EXPERIENCE}
      maxStageWarnDays={MAX_STAGE_WARN_DAYS}
      profile={profile}
      tokens={tokens}
      userEmail={session?.user?.email ?? null}
      updateProfile={updateProfile}
      addSource={addSource}
      renameSource={renameSource}
      removeSource={removeSource}
      addBand={addBand}
      updateBand={updateBand}
      removeBand={removeBand}
      updateStageWarnDays={updateStageWarnDays}
      createToken={createApiToken}
      revokeToken={revokeApiToken}
    />
  );
}
