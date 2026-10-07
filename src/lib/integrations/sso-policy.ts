import "server-only";
import { CredentialsSignin } from "next-auth";
import { prisma } from "@/lib/prisma";

export class SsoRequiredError extends CredentialsSignin {
  static type = "SsoRequiredError";
  code = "sso_required";
}

/** True when the user belongs to an org that enforces SSO and isn't an OWNER
 * there — owners keep local login so a broken IdP can't lock everyone out. */
export async function isLocalLoginBlocked(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      role: { not: "OWNER" },
      org: { ssoConnection: { is: { enabled: true, enforced: true } } },
    },
    select: { id: true },
  });
  return !!membership;
}
