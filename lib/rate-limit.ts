import 'server-only';

// Request throttling for the unauthenticated auth endpoints (login + register),
// which are otherwise open to unlimited credential-stuffing / brute-force
// attempts.
//
// The limiter is a sliding-window log behind a pluggable store:
//   - InMemoryRateLimitStore — a module-level Map. Counts only hits seen by
//     THIS server process, so behind multiple instances / serverless cold starts
//     the effective limit is per-instance, not global. Fine for local dev/tests.
//   - PostgresRateLimitStore — the shared, cross-instance store. Every instance
//     reads/writes one `rate_limit_hits` table via an atomic, row-locked SQL
//     function, so the limit is GLOBAL. This is the scalable, production path;
//     it reuses the Postgres database this app already depends on, so it needs
//     no extra infrastructure (Redis/Upstash would be an alternative if one were
//     already in the stack).
//
// The store is selected by `createDefaultStore()` (Postgres when DATABASE_URL is
// set, else in-memory; overridable via RATE_LIMIT_STORE). The window logic is
// clock-injectable so it stays deterministically unit-testable.

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

/**
 * A backing store for the sliding-window counter. Implementations own the
 * prune/decide/append step so it can be made atomic where the store allows
 * (the Postgres store does it under a per-key row lock).
 */
export interface RateLimitStore {
  /** Record a hit for `key` at `now` (epoch ms) and report the outcome. */
  check(
    key: string,
    opts: RateLimitOptions,
    now: number
  ): Promise<RateLimitResult>;
  /** Clear all recorded hits (test/maintenance helper). */
  reset?(): void | Promise<void>;
}

/** Pure sliding-window decision over an existing (already-pruned-or-not) log. */
function decide(
  hits: number[],
  opts: RateLimitOptions,
  now: number
): { result: RateLimitResult; nextHits: number[] } {
  const cutoff = now - opts.windowMs;
  const recent = hits.filter((ts) => ts > cutoff);

  if (recent.length >= opts.limit) {
    // Blocked: the window frees up when the oldest hit ages out. Do NOT record
    // this hit, so a client hammering the endpoint can't keep pushing the
    // window forward and starve itself indefinitely.
    return {
      result: {
        allowed: false,
        remaining: 0,
        retryAfterMs: recent[0]! + opts.windowMs - now
      },
      nextHits: recent
    };
  }

  recent.push(now);
  return {
    result: {
      allowed: true,
      remaining: opts.limit - recent.length,
      retryAfterMs: 0
    },
    nextHits: recent
  };
}

/**
 * Per-process, in-memory sliding-window store. State lives in a module-level
 * Map, so it only counts hits seen by this process (see the file header).
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number[]>();

  async check(
    key: string,
    opts: RateLimitOptions,
    now: number
  ): Promise<RateLimitResult> {
    const { result, nextHits } = decide(this.hits.get(key) ?? [], opts, now);
    this.hits.set(key, nextHits);
    return result;
  }

  reset(): void {
    this.hits.clear();
  }
}

/**
 * The SQL side of the Postgres store, isolated behind a function so it can be
 * swapped for a fake in unit tests (the `BoardReader` injectable-seam pattern).
 * `db` is imported lazily so importing this module never constructs the Drizzle
 * client (which throws without DATABASE_URL) — the in-memory path stays usable
 * in tests and local dev without a database.
 */
export type RateLimitExecutor = (
  key: string,
  opts: RateLimitOptions,
  now: number
) => Promise<RateLimitResult>;

const drizzleExecutor: RateLimitExecutor = async (key, opts, now) => {
  const { db } = await import('@/lib/db');
  const { sql } = await import('drizzle-orm');
  // The `rate_limit_hit` function (hand-authored in the migration) prunes,
  // decides, and appends atomically under a per-key row lock, so concurrent
  // requests across all instances see one consistent counter.
  const rows = (await db.execute(
    sql`SELECT allowed, remaining, retry_after_ms
        FROM rate_limit_hit(${key}, ${opts.limit}, ${opts.windowMs}, ${now})`
  )) as Array<{
    allowed: boolean;
    remaining: number;
    retry_after_ms: number;
  }>;
  const row = rows[0]!;
  return {
    allowed: row.allowed,
    remaining: Number(row.remaining),
    retryAfterMs: Number(row.retry_after_ms)
  };
};

/**
 * Shared, cross-instance store backed by Postgres. Delegates the atomic window
 * step to `rate_limit_hit()` in the database.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  constructor(private readonly exec: RateLimitExecutor = drizzleExecutor) {}

  async check(
    key: string,
    opts: RateLimitOptions,
    now: number
  ): Promise<RateLimitResult> {
    return this.exec(key, opts, now);
  }

  /**
   * Delete rows whose window fully aged out before `olderThan` (epoch ms).
   * Row count is bounded by distinct active keys (per-IP / per-email on the auth
   * endpoints, so small), but a scheduled call keeps one-off keys from lingering
   * forever. Backed by the `rate_limit_hits_updated_at_idx` index.
   */
  async deleteStale(olderThan: number): Promise<void> {
    const { db, rateLimitHits } = await import('@/lib/db');
    const { lt } = await import('drizzle-orm');
    await db.delete(rateLimitHits).where(lt(rateLimitHits.updatedAt, olderThan));
  }
}

/** Sliding-window limiter: a store, its window config, and an injectable clock. */
export class RateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly opts: RateLimitOptions,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Record a hit for `key` and report whether it is within the limit. */
  async check(key: string): Promise<RateLimitResult> {
    try {
      return await this.store.check(key, this.opts, this.now());
    } catch (err) {
      // Fail OPEN: rate limiting is a best-effort mitigation, so a store outage
      // (e.g. the database is briefly unreachable) must not lock every user out
      // of logging in. Allow the request but surface the failure for ops.
      console.warn(
        `[rate-limit] store error for key "${key}", allowing request:`,
        err
      );
      return { allowed: true, remaining: this.opts.limit, retryAfterMs: 0 };
    }
  }

  /** Clear all recorded hits (test/maintenance helper). */
  reset(): void | Promise<void> {
    return this.store.reset?.();
  }
}

/**
 * Best-effort client IP from the standard proxy headers, falling back to a
 * shared bucket so a missing header still throttles (fails safe) rather than
 * bypassing the limit per-request.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    // Trust the RIGHTMOST entry — the address the nearest trusted proxy appended
    // — not the leftmost, which is client-controlled: a caller can prepend an
    // arbitrary `X-Forwarded-For` value and mint a fresh rate-limit bucket on
    // every request, defeating the per-IP login/register throttle. This assumes
    // a single trusted proxy hop in front of the app (as in this deployment); a
    // multi-hop setup would need a configured trusted-hop count.
    const parts = fwd
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** The environment inputs that select the backing store. */
export interface RateLimitStoreEnv {
  RATE_LIMIT_STORE?: string;
  DATABASE_URL?: string;
  // Index signature so a full `process.env` (ProcessEnv) is assignable as the
  // default without a cast; only the two keys above are ever read.
  [key: string]: string | undefined;
}

/**
 * Pick the backing store for this deployment:
 *   - RATE_LIMIT_STORE=memory   → in-memory (force per-process, e.g. for tests)
 *   - RATE_LIMIT_STORE=postgres → Postgres (force the shared store)
 *   - otherwise                 → Postgres when DATABASE_URL is set (the normal
 *                                 deployed case), else in-memory (local dev).
 *
 * The environment is an explicit argument (defaulting to `process.env`) so the
 * selection can be unit-tested by passing a structured override object rather
 * than mutating global `process.env`.
 */
export function createDefaultStore(
  env: RateLimitStoreEnv = process.env
): RateLimitStore {
  const mode = env.RATE_LIMIT_STORE?.toLowerCase();
  if (mode === 'memory') return new InMemoryRateLimitStore();
  if (mode === 'postgres') return new PostgresRateLimitStore();
  if (env.DATABASE_URL) return new PostgresRateLimitStore();
  return new InMemoryRateLimitStore();
}

// One shared store instance backs all limiters; keys are already namespaced by
// each caller (login:ip:*, register:ip:*, register:email:*) so they never
// collide.
const store = createDefaultStore();

// Preconfigured limiters shared across requests in this process.
// Login: slow brute-force per IP. Register: cap new-account creation per IP and
// per targeted email.
export const loginIpLimiter = new RateLimiter(store, {
  limit: 10,
  windowMs: 5 * 60_000
});
export const registerIpLimiter = new RateLimiter(store, {
  limit: 10,
  windowMs: 10 * 60_000
});
export const registerEmailLimiter = new RateLimiter(store, {
  limit: 5,
  windowMs: 60 * 60_000
});
