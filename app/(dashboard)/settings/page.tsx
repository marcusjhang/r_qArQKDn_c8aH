import { auth } from '@/lib/auth';
import { getAllowedEmails } from '@/lib/allowlist';
import SettingsView from '@/components/settings/SettingsView';
import { addAllowedEmail, removeAllowedEmail } from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [emails, session] = await Promise.all([getAllowedEmails(), auth()]);
  return (
    <SettingsView
      emails={emails}
      userEmail={session?.user?.email ?? null}
      addEmail={addAllowedEmail}
      removeEmail={removeAllowedEmail}
    />
  );
}
