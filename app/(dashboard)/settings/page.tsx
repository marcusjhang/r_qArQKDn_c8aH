import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getAllowedEmails } from '@/lib/allowlist';
import SettingsView from '@/components/settings/SettingsView';
import { addAllowedEmail, removeAllowedEmail } from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth();
  // Allowlist management is admin-only. Non-admins are bounced to the board;
  // the server actions enforce the same check independently.
  if (session?.user?.role !== 'admin') redirect('/');

  const emails = await getAllowedEmails();
  return (
    <SettingsView
      emails={emails}
      userEmail={session?.user?.email ?? null}
      addEmail={addAllowedEmail}
      removeEmail={removeAllowedEmail}
    />
  );
}
