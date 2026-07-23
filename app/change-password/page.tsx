import { auth } from '@/lib/auth';
import { PASSWORD_MIN_LENGTH } from '@/lib/registration';
import ChangePasswordForm from './ChangePasswordForm';
import { changePassword } from './actions';

// Gated by the middleware like every non-login route; additionally, the
// `authorized` callback in lib/auth.ts only lets an account reach this page
// while it still carries the seeded default password (mustChangePassword) and
// redirects away once that flag is cleared.
export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const session = await auth();
  return (
    <ChangePasswordForm
      email={session?.user?.email ?? ''}
      minLength={PASSWORD_MIN_LENGTH}
      changePassword={changePassword}
    />
  );
}
