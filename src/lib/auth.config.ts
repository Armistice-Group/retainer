import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  // Self-hosted: always build redirects from the request's Host /
  // X-Forwarded-* so the app works at whatever address it's reached at.
  // (Relying on AUTH_TRUST_HOST alone breaks when AUTH_URL is present but
  // empty, as docker compose passes it — Auth.js checks AUTH_URL first.)
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
