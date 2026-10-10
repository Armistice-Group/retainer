import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Authenticator app (TOTP) turned on — read fresh from the database. */
      twoFactorEnabled?: boolean;
      /** Provider this session signed in with: "credentials", "magic-link",
       * "passkey", "sso", "google". Null for sessions from before it was
       * recorded. */
      signInMethod?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    sessionVersion?: number;
    twoFactorEnabled?: boolean;
    signInMethod?: string;
  }
}
