'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">
          Database not connected
        </h1>
        <p className="max-w-md text-sm text-slate-600">
          Make sure <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">DATABASE_URL</code> is
          set in your environment, then run:
        </p>
      </div>
      <pre className="rounded-lg bg-slate-900 px-6 py-4 text-sm text-slate-100">
        <code>npm run db:setup</code>
      </pre>
      <Button onClick={reset} variant="outline" size="sm">
        Try again
      </Button>
    </div>
  );
}
