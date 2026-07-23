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

  return changePasswordService({ userId, password, confirmPassword });
}
