export { auth as middleware } from '@/lib/auth';

// Run auth on pages only — skip API routes, Next internals, and static files
// (e.g. the brand SVG in /public) so assets aren't gated behind login.
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)'
  ]
};
