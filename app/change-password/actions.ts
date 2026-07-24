'use server';

// Thin adapter for the forced first-login password change; confirms the session itself because Server Actions bypass the page gate (rules in lib/password.ts).

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

  // Restrict this no-current-password path to accounts actually in the forced first-login state, so a hijacked session can't set a known password without proving the old one.
  if (session?.user?.mustChangePassword !== true) {
    return { ok: false, error: 'Password change is not available here.' };
  }

  return changePasswordService({ userId, password, confirmPassword });
}
