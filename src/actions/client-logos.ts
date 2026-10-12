"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import {
  applyWebsiteIcon,
  checkLogoImage,
  ClientLogoError,
  removeClientLogo,
  saveClientLogo,
} from "@/lib/services/client-logos";
import type { ActionState } from "@/actions/auth";

// Same rule as editing the client: anyone in the org.
async function findClient(clientId: string) {
  const { org } = await requireOrgContext();
  return prisma.client.findFirst({ where: { id: clientId, orgId: org.id }, select: { id: true, website: true } });
}

function revalidate(clientId: string) {
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/edit`);
  revalidatePath("/clients");
}

export async function uploadClientLogoAction(
  clientId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const client = await findClient(clientId);
  if (!client) return { error: "Client not found." };
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const contentType = checkLogoImage(bytes);
    await saveClientLogo(client.id, { bytes, contentType, source: "upload" });
  } catch (err) {
    if (err instanceof ClientLogoError) return { error: err.message };
    throw err;
  }
  revalidate(client.id);
  return null;
}

export async function fetchClientLogoAction(clientId: string): Promise<ActionState> {
  const client = await findClient(clientId);
  if (!client) return { error: "Client not found." };
  if (!client.website) return { error: "Add the client's website first." };
  try {
    await applyWebsiteIcon(client.id, client.website);
  } catch (err) {
    if (err instanceof ClientLogoError) return { error: err.message };
    throw err;
  }
  revalidate(client.id);
  return null;
}

export async function removeClientLogoAction(clientId: string): Promise<ActionState> {
  const client = await findClient(clientId);
  if (!client) return { error: "Client not found." };
  await removeClientLogo(client.id);
  revalidate(client.id);
  return null;
}
