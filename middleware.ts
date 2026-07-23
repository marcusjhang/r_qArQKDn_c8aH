export { auth as middleware } from '@/lib/auth';

// The `authorized` callback in lib/auth.ts gates every matched request behind
// login (only /login is public). The matcher below decides WHICH requests reach
// that callback — everything the app serves must be covered so no page route
// slips through ungated, while non-page requests stay excluded so assets and
// the NextAuth handlers aren't redirected to /login.
//
// Excluded (must NOT be gated):
//   - `api/`   NextAuth handlers + /api/register (self-guarded by the allowlist).
//              Anchored with a trailing slash so a page route that merely starts
//              with "api" (e.g. a future /api-docs) is still gated, not excluded.
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
