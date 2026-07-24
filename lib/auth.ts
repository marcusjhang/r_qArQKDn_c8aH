import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import { normalizeEmail } from '@/lib/allowlist';
import { credentialsSchema, resolveUserId } from '@/lib/auth-policy';
import { authConfig } from '@/lib/auth.config';

// A fixed valid bcrypt hash compared against when an email has no account, so a
// login spends the same time either way and can't be used to enumerate accounts.
const DUMMY_PASSWORD_HASH =
  '$2b$12$Xeks340lYa0VBDkQ8Sbgbev6kWU96I4DaBZ3YZMKwOBmEVp4cPi2K';

// The full Node-runtime auth config: edge-safe `authConfig` plus the DB-backed
// credentials provider. Imports postgres/bcryptjs, so it must never reach the Edge bundle.
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

        // Always run a bcrypt compare (real hash or the dummy) so response time
        // doesn't reveal whether the account exists.
        const valid = await compare(
          password,
          user?.passwordHash ?? DUMMY_PASSWORD_HASH
        );
        if (!user || !valid) return null;

        return {
          id: String(user.id),
          // Display name derived from the stored name parts; null when neither is set.
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
          email: user.email,
          mustChangePassword: user.mustChangePassword
        };
      }
    })
  ]
});

/**
 * Auth guard for Server Actions: the signed-in user's numeric id, or throws
 * `Unauthorized`. The middleware gates pages only, so every action must confirm
 * the session itself; wraps the pure `resolveUserId` with the live session.
 */
export async function requireUser(): Promise<number> {
  return resolveUserId(await auth());
}
