// Minimal, dependency-free rate limiter.
//
// Backed by a module-level Map with fixed windows. This is deliberately edge-
// safe (no Node built-ins, no `server-only`) so it can be imported anywhere in
// the auth path — including modules that are also bundled for the Edge runtime.
//
// Caveat: the counters live in a single process's memory, so they reset on
// redeploy and are not shared across serverless instances. That is fine as a
// brute-force speed bump for this app; swap in a shared store (Redis, Upstash,
// etc.) behind the same `rateLimit`/`rateLimitReset` API if you need strict,
// cluster-wide limits.

export type RateLimitOptions = {
  /** Max number of hits allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export type RateLimitResult = {
  /** True if this hit is within the allowed budget. */
  ok: boolean;
  /** Hits remaining in the current window (never negative). */
  remaining: number;
  /** Seconds until the current window resets — use for the Retry-After header. */
  retryAfter: number;
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Bound memory by sweeping expired buckets. Cheap and lazy: runs at most once
// per second on the next call, so a burst of requests doesn't sweep repeatedly.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 1000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Record one hit against `key` and report whether it is within budget. Callers
 * that only want to penalize failures (e.g. login) should call this on the
 * failing path and `rateLimitReset` on success.
 */
export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  sweep(now);

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  const remaining = Math.max(0, opts.limit - bucket.count);
  const retryAfter = Math.max(0, Math.ceil((bucket.resetAt - now) / 1000));
  return { ok: bucket.count <= opts.limit, remaining, retryAfter };
}

/** Clear a key's window — e.g. after a successful login. */
export function rateLimitReset(key: string): void {
  buckets.delete(key);
}

/**
 * Best-effort client IP from a request's forwarding headers. Returns `unknown`
 * when nothing is present so callers still get a stable (if coarse) key rather
 * than skipping the limit entirely.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
