import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

// Build the gate from the EDGE-SAFE `authConfig` (lib/auth.config.ts) instead of
// the full `lib/auth.ts`. Middleware runs on the Edge runtime, and the full
// config imports the DB-backed credentials provider (lib/db.ts → postgres,
// Node-only) — pulling it in here bundles postgres into the Edge middleware and
// warns "A Node.js module is loaded ('stream') … not supported in the Edge
// Runtime". The edge config has no provider (session strategy is `jwt`, so the
// gate verifies the cookie without a DB lookup), keeping the middleware clean.
export const { auth: middleware } = NextAuth(authConfig);

// The `authorized` callback in lib/auth.config.ts gates every matched request
// behind login (only /login is public). The matcher below decides WHICH requests
// reach that callback — everything the app serves must be covered so no page
// route slips through ungated, while non-page requests stay excluded so assets
// and the NextAuth handlers aren't redirected to /login.
//
// Excluded (must NOT be gated):
//   - `api/`   NextAuth handlers, /api/register (self-guarded by the allowlist),
//              and /api/mcp (the MCP endpoint, self-guarded by a per-user bearer
//              token — see app/api/mcp/route.ts). These authenticate themselves,
//              not via the login cookie, so the gate would wrongly 302 them to
//              /login. Anchored with a trailing slash so a page route that merely
//              starts with "api" (e.g. a future /api-docs) is still gated.
//   - `_next/static`, `_next/image`  Next build output and the image optimizer.
//   - `favicon.ico` and any request ending in a static-asset extension (images,
//              fonts, web manifest, txt/xml) — e.g. the brand SVG in /public —
//              so static assets render without a login redirect breaking the UI.
// Everything else (all page routes) reaches the auth gate.
//
// The pattern MUST be an inline string literal: Next statically analyses this
// `config` export at build time and rejects a matcher that references an
// imported/computed value (`Unknown identifier ... at config.matcher[0]`), which
// breaks `next build`. The behavioural source of truth is `GATE_MATCHER` in
// lib/auth-policy.ts (unit-tested via `gateMatchesPath`); the copy here is kept
// identical to it by the drift guard in test/unit/auth-gate.test.ts.
export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|bmp|woff|woff2|ttf|otf|eot|txt|xml|webmanifest)$).*)'
  ]
};
