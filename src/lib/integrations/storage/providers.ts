import "server-only";
import type { DetectedLink } from "./detect";
import type { LinkDetails } from "./enrich";

/** Provider lookups — filled in as each provider's connection is added. */
export async function lookupLinkedItem(_userId: string, _link: DetectedLink): Promise<LinkDetails | null> {
  return null;
}
