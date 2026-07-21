import HiringApp from '@/components/hiring/HiringApp';
import { getBoardData } from '@/lib/hiring/queries';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const initial = await getBoardData();
  return <HiringApp initial={initial} />;
}
