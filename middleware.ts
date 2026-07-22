import { GATE_MATCHER } from '@/lib/auth-policy';

export { auth as middleware } from '@/lib/auth';

// The `authorized` callback in lib/auth.ts gates every matched request behind
// login (only /login is public). The matcher below decides WHICH requests reach
// that callback — everything the app serves must be covered so no page route
// slips through ungated, while non-page requests stay excluded so assets and
// the NextAuth handlers aren't redirected to /login.
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
// Everything else (all page routes) reaches the auth gate. The pattern lives in
// lib/auth-policy.ts as GATE_MATCHER (single source of truth, unit-tested there).
export const config = {
  matcher: [GATE_MATCHER]
};
