'use client';

// Shared client clock for time-in-stage UI. Returns null until mounted (then epoch-ms, refreshed every intervalMs) to avoid a server/client hydration mismatch.

import { useEffect, useState } from 'react';

export function useNow(intervalMs = 60_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
