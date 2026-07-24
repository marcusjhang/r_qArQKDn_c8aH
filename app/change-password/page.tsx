import { auth } from '@/lib/auth';
import { PASSWORD_MIN_LENGTH } from '@/lib/registration';
import ChangePasswordForm from './ChangePasswordForm';
import { changePassword } from './actions';

// The `authorized` callback (lib/auth.ts) only lets an account reach this page while it carries mustChangePassword, redirecting away once cleared.
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
