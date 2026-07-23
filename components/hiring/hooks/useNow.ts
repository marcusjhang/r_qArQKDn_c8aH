'use client';

// A shared client clock for time-in-stage UI.
//
// Returns `null` until the component has mounted, then the current epoch-ms,
// refreshed every `intervalMs`. The null-until-mounted contract is deliberate:
// the server render and the first client render must agree, but a live "days in
// stage" reading would differ between them (and drift as the clock ticks). By
// rendering no time-based UI on the server and filling it in only after
// hydration, we avoid a hydration mismatch — the overdue badge simply appears a
// beat after the board paints. Callers guard on `now != null` before computing.

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
