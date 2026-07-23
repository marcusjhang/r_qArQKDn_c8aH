import HiringApp from '@/components/hiring/HiringApp';
import { hiringService } from '@/lib/hiring/service';
import { getNotifications } from '@/lib/hiring/chat-queries';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const [initial, session] = await Promise.all([
    hiringService.getBoard(),
    auth()
  ]);

  // Resolve the signed-in user from the board's canonical user list (already
  // loaded) rather than a second query, then load their mention inbox.
  const email = session?.user?.email ?? null;
  const currentUserId =
    email == null
      ? null
      : (initial.users.find((u) => u.email === email)?.id ?? null);
  const notifications =
    currentUserId == null ? [] : await getNotifications(currentUserId);

  return (
    <HiringApp
      initial={initial}
      userEmail={email}
      notifications={notifications}
    />
  );
}
