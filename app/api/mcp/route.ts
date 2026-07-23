// Deployed MCP endpoint for the hiring board — a Streamable HTTP server that
// ships with the app (no separate service). Logged-in users mint a personal
// bearer token in /settings and connect it from Claude Code:
//
//   claude mcp add --transport http hiring \
//     https://<host>/api/mcp --header "Authorization: Bearer <token>"
//
// `withTokenAuth` verifies the bearer against the api_tokens table before any
// tool runs (a missing/invalid/expired token → 401); the resolved user is the
// actor every write acts as. This route is excluded from the login-cookie
// middleware matcher (see middleware.ts) — it self-guards via the token.
//
// Stateless Streamable HTTP: a fresh server + transport is created per POST, so
// no Redis/session store is needed. `basePath: '/api'` makes the handler's
// streamable endpoint resolve to this file's path, `/api/mcp`.

import { createMcpHandler } from 'mcp-handler';
import { registerHiringTools } from '@/lib/mcp/tools';
import { withTokenAuth } from '@/lib/mcp/auth';

// The token verification and Drizzle writes need Node APIs (node:crypto,
// postgres-js), so pin the Node.js runtime rather than the Edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = createMcpHandler(
  (server) => {
    registerHiringTools(server);
  },
  {
    serverInfo: { name: 'hiring-board', version: '1.0.0' }
  },
  {
    basePath: '/api',
    // SSE is not part of the current MCP transport spec and needs Redis for
    // resumability; this server is Streamable-HTTP only.
    disableSse: true,
    maxDuration: 60
  }
);

const authHandler = withTokenAuth(handler);

export { authHandler as GET, authHandler as POST };
