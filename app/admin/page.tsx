import { db, users, products } from '@/lib/db';
import { count } from 'drizzle-orm';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const [{ value: userCount }] = await db
    .select({ value: count() })
    .from(users);
  const [{ value: productCount }] = await db
    .select({ value: count() })
    .from(products);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          Overview of your application data.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Users" value={userCount} />
        <StatCard label="Total Products" value={productCount} />
        <StatCard label="Admin Panel" value="Active" />
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-base text-slate-100">
            Test Credentials
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-400 space-y-1">
          <p>
            Email: <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-mono text-slate-300">admin@admin.com</code>
          </p>
          <p>
            Password: <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-mono text-slate-300">password</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="pt-6">
        <p className="text-sm text-slate-400">{label}</p>
        <p className="text-3xl font-bold tracking-tight text-slate-100 mt-1">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
