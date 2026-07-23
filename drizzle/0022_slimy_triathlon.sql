CREATE TABLE "rate_limit_hits" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" bigint[] DEFAULT ARRAY[]::bigint[] NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
-- Hand-authored (drizzle-kit cannot emit functions/indexes for this). Atomic
-- sliding-window rate limiter over rate_limit_hits, called by
-- PostgresRateLimitStore in lib/rate-limit.ts. Idempotent via CREATE OR REPLACE
-- and IF NOT EXISTS, so 0000->latest and incremental setups both succeed.
--
-- All timestamps are epoch milliseconds. The upsert takes a row lock on the
-- key, so concurrent hits (across every app instance) serialize: prune expired
-- timestamps, decide against the limit, then conditionally append this hit and
-- persist -- all in one committed statement, so the counter can never race.
CREATE OR REPLACE FUNCTION rate_limit_hit(
	p_key text,
	p_limit integer,
	p_window_ms bigint,
	p_now bigint
) RETURNS TABLE(allowed boolean, remaining integer, retry_after_ms integer)
LANGUAGE plpgsql AS $$
DECLARE
	v_cutoff bigint := p_now - p_window_ms;
	v_hits bigint[];
	v_count integer;
BEGIN
	-- Upsert-and-lock the row for this key so concurrent hits serialize.
	INSERT INTO rate_limit_hits (key, hits, updated_at)
	VALUES (p_key, ARRAY[]::bigint[], p_now)
	ON CONFLICT (key) DO UPDATE SET updated_at = p_now
	RETURNING hits INTO v_hits;

	-- Drop timestamps that have aged out of the window (oldest first).
	SELECT coalesce(array_agg(t ORDER BY t), ARRAY[]::bigint[])
		INTO v_hits
		FROM unnest(v_hits) AS t
		WHERE t > v_cutoff;

	v_count := coalesce(array_length(v_hits, 1), 0);

	IF v_count >= p_limit THEN
		-- Over the limit: keep the pruned log (do NOT extend the window) and
		-- report when the oldest hit will age out.
		UPDATE rate_limit_hits SET hits = v_hits, updated_at = p_now WHERE key = p_key;
		RETURN QUERY SELECT false, 0, (v_hits[1] + p_window_ms - p_now)::integer;
	ELSE
		-- Under the limit: record this hit.
		v_hits := v_hits || p_now;
		UPDATE rate_limit_hits SET hits = v_hits, updated_at = p_now WHERE key = p_key;
		RETURN QUERY SELECT true, (p_limit - v_count - 1), 0;
	END IF;
END;
$$;
--> statement-breakpoint
-- Supports optional cleanup of rows whose window has fully aged out
-- (PostgresRateLimitStore.deleteStale / a maintenance job).
CREATE INDEX IF NOT EXISTS "rate_limit_hits_updated_at_idx"
	ON "rate_limit_hits" ("updated_at");
