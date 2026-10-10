"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { resolvePick, searchConnected } from "@/lib/integrations/storage/connections";
import { FILE_PROVIDERS, ProviderError, type FileProviderId, type PickerItem } from "@/lib/integrations/storage/types";

function provider(id: string): FileProviderId {
  if (!(FILE_PROVIDERS as string[]).includes(id)) throw new ProviderError("Unknown service.");
  return id as FileProviderId;
}

// 401/403 is usually an expired or revoked connection, but a missing API or
// permission on the app's side looks the same — say which when we can tell.
function friendlyProviderError(message: string) {
  if (/missing_scope|insufficient|accessNotConfigured|has not been used|is disabled/i.test(message)) {
    return `The service refused: ${message.replace(/^\d{3}:\s*/, "")}. An owner should check that service's setup under Settings → Integrations → Files & docs (Google: Drive API enabled; Dropbox: permissions ticked), then reconnect on your profile.`;
  }
  if (/^(401|403):/.test(message)) return "Your connection expired or was revoked — reconnect it on your profile.";
  return message;
}

export async function searchFilesAction(
  providerId: string,
  query: string
): Promise<{ items?: PickerItem[]; error?: string }> {
  const { user } = await requireOrgContext();
  try {
    return { items: await searchConnected(user.id, provider(providerId), query) };
  } catch (err) {
    if (err instanceof ProviderError) {
      return { error: friendlyProviderError(err.message) };
    }
    console.warn("[files] Search failed", providerId, err);
    return { error: "Couldn't search right now." };
  }
}

/** A picked item's link to store (Dropbox picks become shared links). */
export async function resolvePickAction(providerId: string, url: string): Promise<{ url?: string; error?: string }> {
  const { user } = await requireOrgContext();
  try {
    return { url: await resolvePick(user.id, provider(providerId), url) };
  } catch (err) {
    return { error: err instanceof ProviderError ? err.message : "Couldn't link that item." };
  }
}

export async function disconnectFileServiceAction(providerId: string) {
  const { user } = await requireOrgContext();
  await prisma.userConnection.deleteMany({ where: { userId: user.id, provider: provider(providerId) } });
  revalidatePath("/profile");
}
