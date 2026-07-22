import { auth } from '@/lib/auth';
import { getAllowedEmails } from '@/lib/allowlist';
import { getUsers } from '@/lib/users';
import SettingsView from '@/components/settings/SettingsView';
import { addAllowedEmail, removeAllowedEmail, setUserRole } from './actions';
import {
  canManageAllowlist,
  canManageRoles,
  isOwner,
  toRole
} from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth();
  const viewerRole = toRole(session?.user?.role);
  const canManageEmails = canManageAllowlist(viewerRole);
  const canManageMembers = canManageRoles(viewerRole);

  // Only fetch the admin data for those allowed to manage it (RBAC).
  const [emails, members] = await Promise.all([
    canManageEmails ? getAllowedEmails() : Promise.resolve([]),
    canManageMembers ? getUsers() : Promise.resolve([])
  ]);

  return (
    <SettingsView
      emails={emails}
      members={members}
      userEmail={session?.user?.email ?? null}
      viewerIsOwner={isOwner(viewerRole)}
      canManageAllowlist={canManageEmails}
      canManageRoles={canManageMembers}
      addEmail={addAllowedEmail}
      removeEmail={removeAllowedEmail}
      setUserRole={setUserRole}
    />
  );
}
