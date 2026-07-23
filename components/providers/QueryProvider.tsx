'use client';

// App-wide TanStack Query provider.
//
// The hiring module's client state (the board, the per-applicant chat thread,
// and the mention inbox) is synchronized with the server through this one
// QueryClient instead of hand-rolled `router.refresh()` / effect dances. The
// defaults encode this app's data model: server truth is delivered to the
// client as RSC props (seeded via each query's `initialData`) and refreshed
// explicitly by `invalidateQueries` after a mutation — so nothing auto-refetches
// in the background, and a failed write rolls back and re-reads the
// authoritative row rather than being retried silently.
//
// The client is created once per mount (held in state) so a re-render never
// throws the cache away.

import { useState, type ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig
} from '@tanstack/react-query';

const config: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false
    },
    mutations: {
      retry: false
    }
  }
};

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient(config));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
