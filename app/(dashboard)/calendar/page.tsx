import CalendarApp from '@/components/calendar/CalendarApp';
import { getCalendarData } from '@/lib/hiring/scheduling/queries';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const [data, session] = await Promise.all([getCalendarData(), auth()]);
  return <CalendarApp initial={data} userEmail={session?.user?.email ?? null} />;
}
