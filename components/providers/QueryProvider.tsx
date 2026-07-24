'use client';

// App-wide single TanStack QueryClient. Nothing auto-refetches; refreshes are
// explicit invalidateQueries after mutations. Created once per mount (held in
// state) so a re-render never throws the cache away.

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
