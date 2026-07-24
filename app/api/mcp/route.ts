// MCP endpoint for the hiring board (stateless Streamable HTTP). Excluded from the middleware matcher — self-guards via withTokenAuth against the api_tokens table (401 on missing/invalid/expired).

import { createMcpHandler } from 'mcp-handler';
import { registerHiringTools } from '@/lib/mcp/tools';
import { withTokenAuth } from '@/lib/mcp/auth';

// Pin the Node.js runtime — token verification + Drizzle writes need Node APIs (node:crypto, postgres-js).
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
    // SSE needs Redis for resumability; this server is Streamable-HTTP only.
    disableSse: true,
    maxDuration: 60
  }
);

const authHandler = withTokenAuth(handler);

export { authHandler as GET, authHandler as POST };
