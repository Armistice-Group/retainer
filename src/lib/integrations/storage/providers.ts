import "server-only";
import type { DetectedLink } from "./detect";
import type { LinkDetails } from "./enrich";
import { accessTokenFor, connectionFor } from "./connections";
import { providerFor } from "./registry";
import type { FileProviderId } from "./types";

/** Looks a pasted link up with the person's own connection to its service. */
export async function lookupLinkedItem(userId: string, link: DetectedLink): Promise<LinkDetails | null> {
  const provider = providerFor(link.provider);
  if (!provider) return null;
  const connection = await connectionFor(userId, link.provider as FileProviderId);
  if (!connection) return null;
  return provider.lookup(await accessTokenFor(connection), link);
}
