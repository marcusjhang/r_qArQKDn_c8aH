import HiringApp from '@/components/hiring/HiringApp';
import { getBoardData } from '@/lib/hiring/queries';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const [initial, session] = await Promise.all([getBoardData(), auth()]);
  return (
    <HiringApp
      initial={initial}
      userEmail={session?.user?.email ?? null}
      isAdmin={session?.user?.role === 'admin'}
    />
  );
}
