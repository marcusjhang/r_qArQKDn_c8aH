import { db, products } from '@/lib/db';
import { count } from 'drizzle-orm';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

async function getDbStatus() {
  try {
    const [{ value }] = await db.select({ value: count() }).from(products);
    return { connected: true, productCount: value };
  } catch {
    return { connected: false, productCount: 0 };
  }
}

export default async function WelcomePage() {
  const dbStatus = await getDbStatus();

  return (
    <div className="space-y-12">
      {/* Hero */}
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500" />
          </span>
          Ready to build
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Welcome to your
          <br />
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            Next.js + Postgres
          </span>{' '}
          starter
        </h1>
        <p className="max-w-2xl text-lg text-slate-600">
          A full-stack template with authentication, a PostgreSQL database, and
          Drizzle ORM — all wired up and ready to go. Start building your app.
        </p>
      </div>

      {/* Status cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatusCard
          title="Database"
          connected={dbStatus.connected}
          detail={
            dbStatus.connected
              ? `${dbStatus.productCount} products seeded`
              : 'Run: npm run db:setup'
          }
        />
        <StatusCard
          title="Authentication"
          connected={true}
          detail="Auth.js with credentials"
        />
        <StatusCard
          title="ORM"
          connected={true}
          detail="Drizzle + Neon serverless"
        />
      </div>

      {/* Tech stack & next steps */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stack</CardTitle>
            <CardDescription>What&apos;s included in this template</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {[
                'Next.js 15',
                'React 19',
                'TypeScript',
                'Tailwind CSS',
                'Shadcn UI',
                'Auth.js',
                'Drizzle ORM',
                'Neon Postgres',
                'Zod'
              ].map((tech) => (
                <Badge key={tech} variant="secondary" className="font-normal">
                  {tech}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next steps</CardTitle>
            <CardDescription>Get building with these starting points</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-500">1</span>
                Edit the schema in <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">lib/schema.ts</code>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-500">2</span>
                Generate a migration with <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">npm run db:generate</code>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-500">3</span>
                Apply it with <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">npm run db:migrate</code>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-500">4</span>
                Build your pages in <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">app/</code>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-slate-400">
        Built with Lightsprint &middot; Database powered by Neon
      </p>
    </div>
  );
}

function StatusCard({
  title,
  connected,
  detail
}: {
  title: string;
  connected: boolean;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            connected ? 'bg-emerald-50' : 'bg-amber-50'
          }`}
        >
          {connected ? (
            <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}
