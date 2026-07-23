import { auth } from '@/lib/auth';
import { getSources } from '@/lib/sources';
import { getSeniorityBands } from '@/lib/seniority';
import { MAX_YEARS_EXPERIENCE } from '@/lib/hiring/model/primitives';
import { getProfile } from '@/lib/profile';
import SettingsView from '@/components/settings/SettingsView';
import {
  updateProfile,
  addSource,
  renameSource,
  removeSource,
  addBand,
  updateBand,
  removeBand
} from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [sources, bands, profile, session] = await Promise.all([
    getSources(),
    getSeniorityBands(),
    getProfile(),
    auth()
  ]);
  return (
    <SettingsView
      sources={sources}
      bands={bands}
      maxYears={MAX_YEARS_EXPERIENCE}
      profile={profile}
      userEmail={session?.user?.email ?? null}
      updateProfile={updateProfile}
      addSource={addSource}
      renameSource={renameSource}
      removeSource={removeSource}
      addBand={addBand}
      updateBand={updateBand}
      removeBand={removeBand}
    />
  );
}
