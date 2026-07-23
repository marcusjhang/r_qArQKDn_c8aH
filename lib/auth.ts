import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import { normalizeEmail } from '@/lib/allowlist';
import { credentialsSchema, resolveUserId } from '@/lib/auth-policy';
import { authConfig } from '@/lib/auth.config';

// The full, Node-runtime auth config: the edge-safe `authConfig` (pages, session
// strategy, and the authorized/jwt/session callbacks) plus the DB-backed
// credentials provider. This module imports `lib/db.ts` (postgres) and bcryptjs,
// so it must never reach the Edge middleware bundle — `middleware.ts` builds the
// gate from `authConfig` alone. Everything server-side (the API route,
// server-component/action `auth()`, `requireUser`) imports from here.
export const { handlers, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' }
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, normalizeEmail(email)))
          .limit(1);

        if (!user) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: String(user.id),
          // Session display name is derived from the stored name parts (the
          // `name` column was removed); falls back to null when neither is set.
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
          email: user.email,
          mustChangePassword: user.mustChangePassword
        };
      }
    })
  ]
});

/**
 * Auth guard for Server Actions. Returns the signed-in user's numeric id, or
 * throws `Unauthorized` when there is no session.
 *
 * The `authorized` callback (lib/auth.config.ts) only gates *page* routes:
 * Server Actions dispatch by action id (via the `Next-Action` header), and that
 * request can be POSTed to the public `/login` route, which the page gate lets
 * through. So the middleware never protects an action — every action must
 * confirm the session itself. Throwing (rather than silently no-op'ing) aborts
 * before any DB write and, for the optimistic board actions, triggers the client
 * store's rollback.
 *
 * Uses the numeric id set on the session (see the `session` callback) as the
 * "signed in" signal, matching how `lib/profile.ts` and the settings actions
 * already read it. The session→id resolution is the pure, unit-tested
 * `resolveUserId` (lib/auth-policy); this wrapper only supplies the live session.
 */
export async function requireUser(): Promise<number> {
  return resolveUserId(await auth());
}
