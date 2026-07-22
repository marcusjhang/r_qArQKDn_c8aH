import { auth } from '@/lib/auth';
import { getAllowedEmails } from '@/lib/allowlist';
import { getSources } from '@/lib/sources';
import SettingsView from '@/components/settings/SettingsView';
import {
  addAllowedEmail,
  removeAllowedEmail,
  addSource,
  renameSource,
  removeSource
} from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [emails, sources, session] = await Promise.all([
    getAllowedEmails(),
    getSources(),
    auth()
  ]);
  return (
    <SettingsView
      emails={emails}
      sources={sources}
      userEmail={session?.user?.email ?? null}
      addEmail={addAllowedEmail}
      removeEmail={removeAllowedEmail}
      addSource={addSource}
      renameSource={renameSource}
      removeSource={removeSource}
    />
  );
}
