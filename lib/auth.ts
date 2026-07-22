import NextAuth from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { db, users } from '@/lib/db';
import { normalizeEmail } from '@/lib/allowlist';
import { eq } from 'drizzle-orm';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
    };
  }

  interface User {
    id?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
  }
}

// Validate the untyped credentials payload at the authorize boundary. On any
// parse failure we return null (an authentication failure) rather than throw.
const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

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
          email: user.email
        };
      }
    })
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    // Runs in middleware for every matched route (see middleware.ts). Gates the
    // whole app behind login: only the sign-in page is public. Returning false
    // redirects to pages.signIn ('/login') with a callbackUrl back to the route.
    authorized({ auth, request }) {
      if (request.nextUrl.pathname === '/login') return true;
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id;
      return session;
    }
  }
});
