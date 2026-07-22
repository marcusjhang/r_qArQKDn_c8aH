import HiringApp from '@/components/hiring/HiringApp';
import { hiringService } from '@/lib/hiring/service';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const [initial, session] = await Promise.all([
    hiringService.getBoard(),
    auth()
  ]);
  return <HiringApp initial={initial} userEmail={session?.user?.email ?? null} />;
}
