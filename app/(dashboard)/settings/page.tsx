import { auth } from '@/lib/auth';
import { getAllowedEmails } from '@/lib/allowlist';
import { getSources } from '@/lib/sources';
import { getSeniorityBands } from '@/lib/seniority';
import { MAX_YEARS_EXPERIENCE } from '@/lib/hiring/primitives';
import SettingsView from '@/components/settings/SettingsView';
import {
  addAllowedEmail,
  removeAllowedEmail,
  addSource,
  renameSource,
  removeSource,
  addBand,
  updateBand,
  removeBand
} from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [emails, sources, bands, session] = await Promise.all([
    getAllowedEmails(),
    getSources(),
    getSeniorityBands(),
    auth()
  ]);
  return (
    <SettingsView
      emails={emails}
      sources={sources}
      bands={bands}
      maxYears={MAX_YEARS_EXPERIENCE}
      userEmail={session?.user?.email ?? null}
      addEmail={addAllowedEmail}
      removeEmail={removeAllowedEmail}
      addSource={addSource}
      renameSource={renameSource}
      removeSource={removeSource}
      addBand={addBand}
      updateBand={updateBand}
      removeBand={removeBand}
    />
  );
}
