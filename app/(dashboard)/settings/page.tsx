import { auth } from '@/lib/auth';
import { getSources } from '@/lib/sources';
import { getSeniorityBands } from '@/lib/seniority';
import { MAX_YEARS_EXPERIENCE } from '@/lib/hiring/primitives';
import { getProfile } from '@/lib/profile';
import { getApiTokens } from '@/lib/tokens';
import { PASSWORD_MIN_LENGTH } from '@/lib/registration';
import SettingsView from '@/components/settings/SettingsView';
import {
  updateProfile,
  updatePassword,
  addSource,
  renameSource,
  removeSource,
  addBand,
  updateBand,
  removeBand,
  createApiToken,
  revokeApiToken
} from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [sources, bands, profile, tokens, session] = await Promise.all([
    getSources(),
    getSeniorityBands(),
    getProfile(),
    getApiTokens(),
    auth()
  ]);
  return (
    <SettingsView
      sources={sources}
      bands={bands}
      maxYears={MAX_YEARS_EXPERIENCE}
      profile={profile}
      tokens={tokens}
      userEmail={session?.user?.email ?? null}
      passwordMinLength={PASSWORD_MIN_LENGTH}
      updateProfile={updateProfile}
      updatePassword={updatePassword}
      addSource={addSource}
      renameSource={renameSource}
      removeSource={removeSource}
      addBand={addBand}
      updateBand={updateBand}
      removeBand={removeBand}
      createToken={createApiToken}
      revokeToken={revokeApiToken}
    />
  );
}
