import CalendarApp from '@/components/calendar/CalendarApp';
import { getCalendarData } from '@/lib/hiring/scheduling/queries';
import { founderByEmail } from '@/lib/hiring/helpers';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const [data, session] = await Promise.all([getCalendarData(), auth()]);
  const email = session?.user?.email ?? null;
  // The signed-in person's interviewer identity — the availability editor shows
  // only their own hours.
  const currentFounderId = founderByEmail(email)?.id ?? null;
  return (
    <CalendarApp
      initial={data}
      userEmail={email}
      currentFounderId={currentFounderId}
    />
  );
}
