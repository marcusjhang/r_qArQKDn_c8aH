import 'server-only';

// Best-effort, in-memory request throttling for the unauthenticated auth
// endpoints (login + register), which are otherwise open to unlimited
// credential-stuffing / brute-force attempts.
//
// SCOPE / LIMITATION: state lives in a module-level Map, so a limiter instance
// only counts hits seen by *this* server process. Behind multiple instances (or
// serverless cold starts) the effective limit is per-instance, not global. This
// is a meaningful mitigation, not a hard guarantee — a shared store (Redis /
// Upstash) is the production-grade upgrade (see the follow-up task). Kept
// framework-agnostic and clock-injectable so the window logic is unit-testable.

export interface RateLimitOptions {
  /** Max allowed hits within the window. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether this hit is under the limit. */
  allowed: boolean;
  /** Hits remaining in the current window (0 when blocked). */
  remaining: number;
  /** Milliseconds until the caller may retry (0 when allowed). */
  retryAfterMs: number;
}

/** Sliding-window counter keyed by an arbitrary string (IP, email, …). */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly opts: RateLimitOptions,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Record a hit for `key` and report whether it is within the limit. */
  check(key: string): RateLimitResult {
    const t = this.now();
    const cutoff = t - this.opts.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);

    if (recent.length >= this.opts.limit) {
      // Blocked: the window frees up when the oldest hit ages out.
      const retryAfterMs = recent[0] + this.opts.windowMs - t;
      this.hits.set(key, recent);
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    recent.push(t);
    this.hits.set(key, recent);
    return {
      allowed: true,
      remaining: this.opts.limit - recent.length,
      retryAfterMs: 0
    };
  }

  /** Clear all recorded hits (test helper). */
  reset(): void {
    this.hits.clear();
  }
}

/**
 * Best-effort client IP from the standard proxy headers, falling back to a
 * shared bucket so a missing header still throttles (fails safe) rather than
 * bypassing the limit per-request.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

// Preconfigured limiters shared across requests in this process.
// Login: slow brute-force per IP. Register: cap new-account creation per IP and
// per targeted email.
export const loginIpLimiter = new RateLimiter({
  limit: 10,
  windowMs: 5 * 60_000
});
export const registerIpLimiter = new RateLimiter({
  limit: 10,
  windowMs: 10 * 60_000
});
export const registerEmailLimiter = new RateLimiter({
  limit: 5,
  windowMs: 60 * 60_000
});
