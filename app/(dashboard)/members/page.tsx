import { auth } from '@/lib/auth';
import { getAllowedEmails } from '@/lib/allowlist';
import { getMembers } from '@/lib/members';
import MembersView from '@/components/members/MembersView';
import { addAllowedEmail, removeAllowedEmail } from './actions';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  const [members, emails, session] = await Promise.all([
    getMembers(),
    getAllowedEmails(),
    auth()
  ]);
  return (
    <MembersView
      members={members}
      emails={emails}
      userEmail={session?.user?.email ?? null}
      addEmail={addAllowedEmail}
      removeEmail={removeAllowedEmail}
    />
  );
}
