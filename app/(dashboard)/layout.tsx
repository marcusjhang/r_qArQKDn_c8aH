import { User } from './user';
import Providers from './providers';

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <header className="border-b bg-white/80 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <span className="text-sm font-semibold tracking-tight text-slate-900">Lightsprint Starter</span>
            </div>
            <User />
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-12">
          {children}
        </main>
      </div>
    </Providers>
  );
}
