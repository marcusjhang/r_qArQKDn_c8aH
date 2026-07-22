export { auth as middleware } from '@/lib/auth';

// Auth runs on every matched request and is deny-by-default: the `authorized`
// callback in lib/auth.ts allows only the paths in PUBLIC_PATHS through
// unauthenticated and redirects everything else to /login.
//
// The matcher runs auth on pages only — API routes, Next internals, and static
// files (e.g. the brand SVG in /public) are excluded so assets aren't gated
// behind login. Public API routes (/api/register, /api/auth/*) do their own
// checks; add any new sensitive API route's own guard rather than relying on
// this matcher.
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)'
  ]
};
