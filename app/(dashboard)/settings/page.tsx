import { auth } from '@/lib/auth';
import { getSources } from '@/lib/sources';
import { getSeniorityBands } from '@/lib/seniority';
import { getStageSlas } from '@/lib/stage-slas';
import { MAX_YEARS_EXPERIENCE, MAX_SLA_DAYS } from '@/lib/hiring/primitives';
import { getProfile } from '@/lib/profile';
import SettingsView from '@/components/settings/SettingsView';
import {
  updateProfile,
  addSource,
  renameSource,
  removeSource,
  addBand,
  updateBand,
  removeBand,
  addStageSla,
  updateStageSla,
  removeStageSla
} from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [sources, bands, stageSlas, profile, session] = await Promise.all([
    getSources(),
    getSeniorityBands(),
    getStageSlas(),
    getProfile(),
    auth()
  ]);
  return (
    <SettingsView
      sources={sources}
      bands={bands}
      stageSlas={stageSlas}
      maxYears={MAX_YEARS_EXPERIENCE}
      maxSlaDays={MAX_SLA_DAYS}
      profile={profile}
      userEmail={session?.user?.email ?? null}
      updateProfile={updateProfile}
      addSource={addSource}
      renameSource={renameSource}
      removeSource={removeSource}
      addBand={addBand}
      updateBand={updateBand}
      removeBand={removeBand}
      addStageSla={addStageSla}
      updateStageSla={updateStageSla}
      removeStageSla={removeStageSla}
    />
  );
}
