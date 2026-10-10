import "server-only";
import { prisma } from "@/lib/prisma";
import { unstable_update } from "@/lib/auth";
import { grantSessionCarry } from "@/lib/session-carry";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Signs the user out everywhere except the browser making this request:
 * bumps User.sessionVersion (the jwt callback then rejects every older
 * token) and re-issues this request's session cookie at the new version.
 * Optional `data` is written in the same update (e.g. the new password).
 *
 * Call it from a Server Action and redirect afterwards: auth() reads the
 * request headers, which still carry the old cookie, so a re-render in the
 * same request would look signed out. A redirect is fetched with the new
 * cookie.
 */
export async function signOutOtherSessions(userId: string, data: Prisma.UserUpdateInput = {}) {
  const { sessionVersion } = await prisma.user.update({
    where: { id: userId },
    data: { ...data, sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  const sessionCarry = grantSessionCarry(userId, sessionVersion);
  // update()'s type only knows the Session shape; the jwt callback reads
  // sessionCarry from whatever is passed here.
  await unstable_update({ sessionCarry } as Parameters<typeof unstable_update>[0]);
}
