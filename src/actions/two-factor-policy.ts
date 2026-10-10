"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import type { ActionState } from "@/actions/auth";

/** Settings → Security: owners turn "Require two-factor authentication" on
 * or off. Turning it on needs the owner's own authenticator app set up
 * first, so the switch can't lock out the person flipping it. */
export async function updateRequireTwoFactorAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role, user } = await requireOrgContext();
  requireRole(role, ["OWNER"]);

  const requireTwoFactor = formData.get("requireTwoFactor") === "on";
  if (requireTwoFactor && !org.requireTwoFactor) {
    const me = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorEnabled: true },
    });
    if (!me.twoFactorEnabled) {
      return {
        error:
          "Set up two-factor authentication on your own Profile first, so turning this on can't lock you out.",
      };
    }
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: { requireTwoFactor },
  });

  revalidatePath("/settings/security");
  revalidatePath("/settings/members");
  return { saved: true };
}
