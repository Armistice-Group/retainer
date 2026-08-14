"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { encrypt, decrypt } from "@/lib/crypto";
import { listEligibleAccounts, MercuryError } from "@/lib/integrations/mercury";
import type { ActionState } from "@/actions/auth";

// Not an OAuth app we operate (see the MercuryConnection model comment) —
// the org pastes a personal API token it generated in its own Mercury
// dashboard, so "connecting" is just validating that token works and
// caching which of the org's Mercury accounts should receive payments.
export async function connectMercuryAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role, user } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  if (org.plan !== "GROWTH") {
    return { error: "Mercury is available on the Growth plan." };
  }

  const apiToken = ((formData.get("apiToken") as string) || "").trim();
  if (!apiToken) {
    return { fieldErrors: { apiToken: ["Paste your Mercury API token."] } };
  }

  let accounts;
  try {
    accounts = await listEligibleAccounts(apiToken);
  } catch (err) {
    return {
      error:
        err instanceof MercuryError
          ? "Couldn't connect to Mercury with that token. Check it has read-write access and try again."
          : "Couldn't reach Mercury. Try again in a moment.",
    };
  }

  if (accounts.length === 0) {
    return { error: "No active Mercury checking accounts found on this token." };
  }

  await prisma.mercuryConnection.upsert({
    where: { orgId: org.id },
    create: {
      orgId: org.id,
      apiToken: encrypt(apiToken),
      destinationAccountId: accounts[0].id,
      destinationAccountName: accounts[0].name,
      connectedById: user.id,
    },
    update: {
      apiToken: encrypt(apiToken),
      destinationAccountId: accounts[0].id,
      destinationAccountName: accounts[0].name,
      connectedById: user.id,
    },
  });

  revalidatePath("/settings/billing");
  return null;
}

// Looks the chosen account up server-side (rather than trusting a
// client-supplied name) so a tampered form can't make an arbitrary label
// stick — the id still has to match one of this org's own eligible accounts.
export async function setMercuryDestinationAccountAction(formData: FormData) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const accountId = (formData.get("accountId") as string) || "";
  if (!accountId) return;

  const connection = await prisma.mercuryConnection.findUnique({ where: { orgId: org.id } });
  if (!connection) return;

  const accounts = await listEligibleAccounts(decrypt(connection.apiToken));
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return;

  await prisma.mercuryConnection.update({
    where: { orgId: org.id },
    data: { destinationAccountId: account.id, destinationAccountName: account.name },
  });
  revalidatePath("/settings/billing");
}

export async function disconnectMercuryAction() {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  await prisma.mercuryConnection.deleteMany({ where: { orgId: org.id } });
  revalidatePath("/settings/billing");
}
