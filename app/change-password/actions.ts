'use server';

// Thin adapter for the forced first-login password change. The middleware gate
// (lib/auth.ts `authorized`) confines a seeded account to /change-password until
// it replaces the shared default password; this action performs the change.
//
// Like every mutation in the app it confirms the session itself — the page gate
// does not protect Server Actions (they dispatch by action id and can be POSTed
// to the public /login route), so being "behind" a gated page is not enough.
// The rules live in the lib/password.ts domain service; this stays an adapter.

import { auth } from '@/lib/auth';
import {
  changePassword as changePasswordService,
  type ChangePasswordResult
} from '@/lib/password';

export async function changePassword(
  password: string,
  confirmPassword: string
): Promise<ChangePasswordResult> {
  const session = await auth();
  const userId = Number(session?.user?.id);
  if (!userId) return { ok: false, error: 'Not signed in.' };

  // Restrict this no-current-password path to accounts ACTUALLY in the forced
  // first-login state. A provisioned account has a real secret and must change
  // its password via /settings, which verifies the current one — otherwise a
  // hijacked/unattended session could POST this action directly and set a known
  // password without proving the old one, defeating updatePassword's guard. A
  // confined account's "current" password is the shared well-known default, so
  // skipping verification for it leaks nothing.
  if (session?.user?.mustChangePassword !== true) {
    return { ok: false, error: 'Password change is not available here.' };
  }

  return changePasswordService({ userId, password, confirmPassword });
}
