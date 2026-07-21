import { auth, signOut } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'admin') {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <aside className="fixed inset-y-0 left-0 w-56 border-r border-slate-800 bg-slate-950 flex flex-col">
        <div className="flex h-14 items-center gap-2.5 border-b border-slate-800 px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-orange-600">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight">Admin</span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <NavLink href="/admin">Dashboard</NavLink>
          <NavLink href="/admin/users">Users</NavLink>
          <NavLink href="/admin/products">Products</NavLink>
        </nav>

        <div className="border-t border-slate-800 p-3 space-y-2">
          <div className="px-3 py-1.5 text-xs text-slate-500 truncate">
            {session.user.email}
          </div>
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm" className="flex-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800">
              <Link href="/">Site</Link>
            </Button>
            <form
              action={async () => {
                'use server';
                await signOut();
              }}
            >
              <Button variant="ghost" size="sm" type="submit" className="text-slate-400 hover:text-slate-100 hover:bg-slate-800">
                Logout
              </Button>
            </form>
          </div>
        </div>
      </aside>

      <main className="ml-56 min-h-screen">
        <div className="mx-auto max-w-5xl px-8 py-10">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
    >
      {children}
    </Link>
  );
}
