import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { findAutoJoinOrg } from "@/lib/org";
import { isLocalLoginBlocked, SsoRequiredError } from "@/lib/integrations/sso-policy";
import { notify, getOrgAdminUserIds } from "@/lib/notifications";
import {
  TwoFactorRequiredError,
  InvalidTwoFactorCodeError,
  verifyLoginTwoFactor,
} from "@/lib/two-factor";
import { consumeLoginTicket } from "@/lib/webauthn";
import { recordAuditEvent } from "@/lib/audit";
import { issueTwoFactorLoginTicket, redeemTwoFactorLoginTicket } from "@/lib/two-factor-ticket";
import { takeSessionCarry } from "@/lib/session-carry";

/** Sessions finished through the Google code step are Google sign-ins. */
function signInMethodFor(provider: string) {
  return provider === "google-two-factor" ? "google" : provider;
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        code: { label: "2FA code", type: "text" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        const code = credentials?.code as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;
        if (await isLocalLoginBlocked(user.id)) throw new SsoRequiredError();

        if (user.twoFactorEnabled && user.twoFactorSecret) {
          if (!code) throw new TwoFactorRequiredError();
          const ok = await verifyLoginTwoFactor(user.id, user.twoFactorSecret, code);
          if (!ok) throw new InvalidTwoFactorCodeError();
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Credentials({
      id: "magic-link",
      name: "Magic Link",
      credentials: {
        token: { label: "Token", type: "text" },
        code: { label: "2FA code", type: "text" },
      },
      authorize: async (credentials) => {
        const token = credentials?.token as string | undefined;
        if (!token) return null;

        const record = await prisma.magicLinkToken.findUnique({ where: { token } });
        if (!record || record.usedAt || record.expiresAt < new Date()) return null;

        const user = await prisma.user.findUnique({ where: { email: record.email } });
        if (!user) return null;
        if (await isLocalLoginBlocked(user.id)) return null;

        // An emailed link proves only the inbox, so it can't stand in for
        // the authenticator: ask for the code before using up the link.
        if (user.twoFactorEnabled && user.twoFactorSecret) {
          const code = credentials?.code as string | undefined;
          if (!code) throw new TwoFactorRequiredError();
          const ok = await verifyLoginTwoFactor(user.id, user.twoFactorSecret, code);
          if (!ok) throw new InvalidTwoFactorCodeError();
        }

        await prisma.magicLinkToken.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        });

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Credentials({
      // Second step of "Continue with Google" for accounts with an
      // authenticator app. Google's own callback never creates a session for
      // them (see the signIn callback): this provider does, and only with a
      // ticket issued by that callback plus a valid code.
      id: "google-two-factor",
      name: "Google two-factor",
      credentials: {
        ticket: { label: "Ticket", type: "text" },
        code: { label: "2FA code", type: "text" },
      },
      authorize: async (credentials) => {
        const ticket = credentials?.ticket as string | undefined;
        const code = credentials?.code as string | undefined;
        if (!ticket || !code) return null;

        const userId = await redeemTwoFactorLoginTicket(ticket, code);
        if (!userId) return null;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return null;
        if (await isLocalLoginBlocked(user.id)) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Credentials({
      // A passkey sign-in is two factors on its own: the device (possession)
      // plus its PIN or biometric — verifyAuthentication() requires the
      // user-verification flag — so it doesn't ask for the TOTP code.
      id: "passkey",
      name: "Passkey",
      // NOT a bare credentialId — see issueLoginTicket()'s doc comment for
      // why a raw identifier can't be trusted here.
      credentials: { ticket: { label: "Ticket", type: "text" } },
      authorize: async (credentials) => {
        const ticket = credentials?.ticket as string | undefined;
        if (!ticket) return null;

        const userId = await consumeLoginTicket(ticket);
        if (!userId) return null;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return null;
        if (await isLocalLoginBlocked(user.id)) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Credentials({
      id: "sso",
      name: "SSO",
      // Same trust model as the passkey provider: this route is publicly
      // reachable, so it must consume a single-use ticket issued only after
      // the OIDC callback already verified the IdP's signed ID token — never
      // a bare user/email identifier.
      credentials: { ticket: { label: "Ticket", type: "text" } },
      authorize: async (credentials) => {
        const ticket = credentials?.ticket as string | undefined;
        if (!ticket) return null;

        const record = await prisma.ssoLoginTicket.findUnique({ where: { token: ticket } });
        if (!record || record.expiresAt < new Date()) return null;
        await prisma.ssoLoginTicket.delete({ where: { id: record.id } });

        const user = await prisma.user.findUnique({ where: { id: record.userId } });
        if (!user) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Google,
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Runs on every auth() call on the server (not in the proxy, which
    // can't reach the database). Checks the session is still current —
    // a password reset bumps User.sessionVersion and signs everyone out —
    // and refreshes the 2FA state the required-2FA gate reads.
    async jwt(params) {
      const token = authConfig.callbacks.jwt(params);
      const { user, account, trigger, session } = params;
      if (user?.id && account) token.signInMethod = signInMethodFor(account.provider);
      if (typeof token.id !== "string") return token;

      const dbUser = await prisma.user.findUnique({
        where: { id: token.id },
        select: { sessionVersion: true, twoFactorEnabled: true },
      });
      if (!dbUser) return null;
      if (user?.id) {
        token.sessionVersion = dbUser.sessionVersion;
      } else {
        // The session that changed the password (or chose "Sign out other
        // sessions") moves to the new version; see lib/session-carry.
        if (trigger === "update") {
          const carried = takeSessionCarry(
            (session as { sessionCarry?: unknown } | undefined)?.sessionCarry,
            token.id
          );
          if (carried !== null && carried === dbUser.sessionVersion) {
            token.sessionVersion = carried;
          }
        }
        if ((token.sessionVersion ?? 0) !== dbUser.sessionVersion) return null;
      }
      token.twoFactorEnabled = dbUser.twoFactorEnabled;
      return token;
    },
    session(params) {
      const session = authConfig.callbacks.session(params);
      const { token } = params;
      if (session.user) {
        session.user.twoFactorEnabled = token.twoFactorEnabled === true;
        session.user.signInMethod =
          typeof token.signInMethod === "string" ? token.signInMethod : null;
      }
      return session;
    },
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      if (!user.email) return false;

      const email = user.email.toLowerCase().trim();
      let dbUser = await prisma.user.findUnique({ where: { email } });

      if (!dbUser) {
        // No open signup on a self-hosted instance — a Google account only
        // gets in if it matches an org's auto-join domain. Everyone else
        // needs an invite first.
        const autoJoinOrg = await findAutoJoinOrg(email);
        if (!autoJoinOrg) return "/login?error=no-account";

        dbUser = await prisma.user.create({
          data: { email, name: user.name || email, passwordHash: null },
        });
        await prisma.membership.create({
          data: { userId: dbUser.id, orgId: autoJoinOrg.id, role: "MEMBER" },
        });
        const adminIds = await getOrgAdminUserIds(prisma, autoJoinOrg.id);
        await notify(prisma, {
          orgId: autoJoinOrg.id,
          userIds: adminIds,
          type: "MEMBER_JOINED",
          message: `${dbUser.name} joined your organization (matched ${autoJoinOrg.domain} domain).`,
          link: "/settings/members",
        });
      } else if (await isLocalLoginBlocked(dbUser.id)) {
        return "/login?error=sso-required";
      }

      // Google proves the account, not the authenticator app. No session yet:
      // the code page finishes the sign-in through "google-two-factor".
      if (dbUser.twoFactorEnabled && dbUser.twoFactorSecret) {
        const ticket = await issueTwoFactorLoginTicket(dbUser.id);
        return `/login/two-factor/${ticket}`;
      }

      user.id = dbUser.id;
      return true;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (!user.id) return;
      const memberships = await prisma.membership.findMany({
        where: { userId: user.id },
        select: { orgId: true },
      });
      await recordAuditEvent(prisma, {
        orgIds: memberships.map((m) => m.orgId),
        actorId: user.id,
        action: "sign_in",
        entityType: "User",
        entityId: user.id,
        entityLabel: account ? signInMethodFor(account.provider) : null,
      });
    },
  },
});
