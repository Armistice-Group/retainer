"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { encrypt } from "@/lib/crypto";
import { fetchAccessToken, testConnection, LaurelError } from "@/lib/integrations/laurel";
import type { ActionState } from "@/actions/auth";

export async function connectLaurelAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role, user } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const customerId = ((formData.get("customerId") as string) || "").trim();
  const clientId = ((formData.get("clientId") as string) || "").trim();
  const clientSecret = ((formData.get("clientSecret") as string) || "").trim();

  if (!customerId || !clientId || !clientSecret) {
    return { error: "All three fields are required." };
  }

  try {
    await fetchAccessToken({ customerId, clientId, clientSecret });
  } catch (err) {
    return {
      error:
        err instanceof LaurelError
          ? `Couldn't authenticate with Laurel: ${err.message}`
          : "Couldn't authenticate with Laurel. Check your credentials and try again.",
    };
  }

  await prisma.laurelConnection.upsert({
    where: { orgId: org.id },
    create: {
      orgId: org.id,
      customerId,
      clientId,
      clientSecret: encrypt(clientSecret),
      connectedById: user.id,
    },
    update: {
      customerId,
      clientId,
      clientSecret: encrypt(clientSecret),
      connectedById: user.id,
    },
  });

  revalidatePath("/settings");
  return null;
}

export async function disconnectLaurelAction() {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  await prisma.laurelConnection.deleteMany({ where: { orgId: org.id } });
  revalidatePath("/settings");
}

export async function testLaurelConnectionAction(): Promise<{ ok: boolean; error: string | null }> {
  const { org } = await requireOrgContext();

  const connection = await prisma.laurelConnection.findUnique({ where: { orgId: org.id } });
  if (!connection) return { ok: false, error: "Not connected." };

  try {
    await testConnection(connection);
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: "Authentication failed. Credentials may be revoked or wrong." };
  }
}
