"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { generateApiKey, hashApiKey } from "@/lib/api-auth";

export async function createApiKeyAction(name: string) {
  const { org, user } = await requireOrgContext();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Give the key a name.");

  const { raw, prefix } = generateApiKey();

  await prisma.apiKey.create({
    data: {
      name: trimmed,
      keyHash: hashApiKey(raw),
      keyPrefix: prefix,
      userId: user.id,
      orgId: org.id,
    },
  });

  revalidatePath("/settings/profile");
  return raw;
}

export async function revokeApiKeyAction(keyId: string) {
  const { user } = await requireOrgContext();
  await prisma.apiKey.updateMany({
    where: { id: keyId, userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/settings/profile");
}
