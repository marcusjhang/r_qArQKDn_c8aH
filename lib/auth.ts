import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { db, users } from '@/lib/db';
import { normalizeEmail } from '@/lib/allowlist';
import { eq } from 'drizzle-orm';

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

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, normalizeEmail(credentials.email as string)))
          .limit(1);

        if (!user) return null;

        const valid = await compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) return null;

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
    // Runs in middleware for every matched route (see middleware.ts). Gates the
    // whole app behind login: only the sign-in page is public. Returning false
    // redirects to pages.signIn ('/login') with a callbackUrl back to the route.
    authorized({ auth, request }) {
      if (request.nextUrl.pathname === '/login') return true;
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
