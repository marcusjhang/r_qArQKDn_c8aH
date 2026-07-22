import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { db, users } from '@/lib/db';
import { normalizeEmail } from '@/lib/allowlist';
import { rateLimit, rateLimitReset } from '@/lib/rate-limit';
import { eq } from 'drizzle-orm';

// Public routes reachable without a session. Everything else is deny-by-default
// (see the `authorized` callback below). Keep this the single source of truth
// for what the middleware lets through unauthenticated.
export const PUBLIC_PATHS = ['/login'] as const;

function isPublicPath(pathname: string): boolean {
  return (PUBLIC_PATHS as readonly string[]).includes(pathname);
}

// Slow down credential-stuffing / brute force: at most this many sign-in
// attempts per email per window. Successful logins reset the counter, so a
// legitimate user is never locked out by their own prior successes.
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

declare module 'next-auth' {
  interface User {
    role?: string;
  }
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      role?: string;
    };
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  pages: {
    signIn: '/login'
  },
  providers: [
    Credentials({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = normalizeEmail(credentials.email as string);

        // Throttle attempts per email. Counting the attempt up front (rather
        // than only on failure) means even an attacker who guesses correctly on
        // the last allowed try still can't exceed the window budget.
        const rlKey = `login:${email}`;
        const rl = rateLimit(rlKey, {
          limit: LOGIN_MAX_ATTEMPTS,
          windowMs: LOGIN_WINDOW_MS
        });
        if (!rl.ok) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user) return null;

        const valid = await compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) return null;

        // Genuine login: clear the counter so normal use never trips the limit.
        rateLimitReset(rlKey);

        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role
        };
      }
    })
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    // Runs in middleware for every matched route (see middleware.ts). Deny by
    // default: only paths in PUBLIC_PATHS are reachable without a session; every
    // other route requires an authenticated user. Returning false redirects to
    // pages.signIn ('/login') with a callbackUrl back to the requested route.
    authorized({ auth, request }) {
      if (isPublicPath(request.nextUrl.pathname)) return true;
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.role = token.role as string | undefined;
      return session;
    }
  }
});

/**
 * Server-side RBAC guard. Resolves the current session and confirms the
 * `role` claim is `admin`. Use this in server actions and admin-only pages —
 * never trust a role sent from the client. Returns the session on success, or
 * null when there is no session or the user is not an admin.
 */
export async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== 'admin') return null;
  return session;
}
