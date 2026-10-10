import "server-only";
import type { DetectedLink, LinkKind } from "./detect";

export type LinkDetails = {
  title?: string | null;
  kind?: LinkKind;
  externalId?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  modifiedAt?: Date | null;
  /** The provider's canonical link, when it has a better one. */
  url?: string | null;
};

/** Looks a linked item up with the person's own connection to its provider
 * (when they have one) for its real title, kind and last-modified date.
 * Best effort: null when there's no connection, no access, or an error. */
export async function enrichLink(userId: string, link: DetectedLink): Promise<LinkDetails | null> {
  if (link.provider === "LINK" || link.provider === "BOX") return null;
  try {
    const { lookupLinkedItem } = await import("./providers");
    return await lookupLinkedItem(userId, link);
  } catch (err) {
    console.warn("[documents] Couldn't look up link", link.provider, err);
    return null;
  }
}
