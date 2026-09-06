import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config: no database, no bcrypt. Shared by `middleware.ts`
 * and the full config in `auth.ts`.
 *
 * SECURITY NOTE: the `authorized` callback below only does a coarse
 * "is there a session?" check for page navigation. The real approval/role gate
 * lives in `lib/auth-guard.ts` and must be called by every page and every
 * server action.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      const isPublic =
        pathname === "/login" ||
        pathname === "/register" ||
        pathname.startsWith("/api/auth");

      if (isPublic) {
        // Keep logged-in users out of the auth screens.
        if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
          return Response.redirect(new URL("/calendar", nextUrl));
        }
        return true;
      }

      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;
