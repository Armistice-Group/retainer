import "server-only";
import { prisma } from "@/lib/prisma";
import { fetchPublicResource, SafeFetchError } from "@/lib/safe-fetch";
import { sniffFileType } from "@/lib/file-type";
import { websiteHref } from "@/lib/format";

// A client's logo: uploaded, or the icon their website advertises
// (apple-touch-icon, <link rel="icon">, else /favicon.ico).

export const MAX_CLIENT_LOGO_BYTES = 1024 * 1024;
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/x-icon", "image/svg+xml"]);

export class ClientLogoError extends Error {}

/** URL of a client's logo in the app (signed-in only), versioned so a new
 * logo replaces the cached one; null when it has none. */
export function clientLogoUrl(client: { id: string; logoUpdatedAt: Date | null }) {
  return client.logoUpdatedAt ? `/api/clients/${client.id}/logo?v=${client.logoUpdatedAt.getTime()}` : null;
}

/** The logo as a data: URI, for pages outside the app (share links, PDFs). */
export async function clientLogoDataUri(clientId: string, opts: { pdf?: boolean } = {}) {
  const logo = await prisma.clientLogo.findUnique({ where: { clientId } });
  if (!logo) return null;
  if (opts.pdf && logo.contentType !== "image/png" && logo.contentType !== "image/jpeg") return null;
  return `data:${logo.contentType};base64,${Buffer.from(logo.data).toString("base64")}`;
}

/** Checks an image's real type and size; returns the type to store. */
export function checkLogoImage(bytes: Uint8Array) {
  if (bytes.length === 0) throw new ClientLogoError("Choose an image file.");
  if (bytes.length > MAX_CLIENT_LOGO_BYTES) throw new ClientLogoError("Logo must be under 1MB.");
  const type = sniffFileType(bytes);
  if (!type || !LOGO_TYPES.has(type)) {
    throw new ClientLogoError("Logo must be a PNG, JPEG, WebP, GIF, SVG, or ICO image.");
  }
  return type;
}

export async function saveClientLogo(
  clientId: string,
  logo: { bytes: Uint8Array; contentType: string; source: "upload" | "website"; sourceUrl?: string | null }
) {
  const data = new Uint8Array(logo.bytes);
  const fields = { data, contentType: logo.contentType, source: logo.source, sourceUrl: logo.sourceUrl ?? null };
  await prisma.$transaction([
    prisma.clientLogo.upsert({ where: { clientId }, create: { clientId, ...fields }, update: fields }),
    prisma.client.update({ where: { id: clientId }, data: { logoUpdatedAt: new Date() } }),
  ]);
}

export async function removeClientLogo(clientId: string) {
  await prisma.$transaction([
    prisma.clientLogo.deleteMany({ where: { clientId } }),
    prisma.client.update({ where: { id: clientId }, data: { logoUpdatedAt: null } }),
  ]);
}

type Candidate = { href: string; score: number };

function attributes(tag: string) {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attrs[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? "").trim();
  }
  return attrs;
}

/** Icons a page's <head> links to, best (largest) first. */
export function iconCandidates(html: string): Candidate[] {
  const head = html.slice(0, 512 * 1024);
  const found: Candidate[] = [];
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(tag);
    const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
    if (!attrs.href) continue;
    const apple = rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed");
    // mask-icon is a one-colour silhouette for Safari's pinned tabs.
    if (!apple && !rel.includes("icon")) continue;
    const svg = (attrs.type ?? "").includes("svg") || /\.svg(\?|#|$)/i.test(attrs.href);
    const sizes = (attrs.sizes ?? "").toLowerCase();
    const largest = Math.max(0, ...[...sizes.matchAll(/(\d+)x(\d+)/g)].map((m) => Number(m[1])));
    const score = svg || sizes === "any"
      ? 512
      : largest || (apple ? 180 : /\.ico(\?|#|$)/i.test(attrs.href) ? 16 : 32);
    found.push({ href: attrs.href, score });
  }
  return found.sort((a, b) => b.score - a.score);
}

function decodeDataUri(uri: string) {
  const m = uri.match(/^data:([^;,]*)(;base64)?,([\s\S]*)$/);
  if (!m) return null;
  return m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
}

/** The best icon a website offers. Throws ClientLogoError when there's none. */
export async function findWebsiteIcon(website: string) {
  let pageUrl: URL;
  try {
    pageUrl = new URL(websiteHref(website.trim()));
  } catch {
    throw new ClientLogoError("The website isn't a valid address.");
  }
  const host = pageUrl.hostname.replace(/^www\./, "");

  let candidates: Candidate[] = [];
  let reachError: string | null = null;
  try {
    const page = await fetchPublicResource(pageUrl.toString(), {
      accept: "text/html,application/xhtml+xml",
      maxBytes: 2 * 1024 * 1024,
    });
    pageUrl = page.url;
    const html = page.bytes.toString("utf8");
    const base = html.match(/<base\b[^>]*href\s*=\s*["']([^"']+)["']/i)?.[1];
    const resolveFrom = base ? new URL(base, pageUrl) : pageUrl;
    candidates = iconCandidates(html).map((c) => ({
      ...c,
      href: c.href.startsWith("data:") ? c.href : new URL(c.href, resolveFrom).toString(),
    }));
  } catch (err) {
    // Some sites refuse anything that isn't a browser; the usual icon
    // locations may still answer.
    reachError = err instanceof SafeFetchError ? err.message : "Couldn't load it.";
  }
  for (const [path, score] of [["/apple-touch-icon.png", 170], ["/favicon.ico", 16]] as const) {
    const href = new URL(path, pageUrl.origin).toString();
    if (!candidates.some((c) => c.href === href)) candidates.push({ href, score });
  }
  candidates.sort((a, b) => b.score - a.score);

  for (const candidate of candidates.slice(0, 6)) {
    try {
      let bytes: Uint8Array | null;
      let sourceUrl: string | null = candidate.href;
      if (candidate.href.startsWith("data:")) {
        bytes = decodeDataUri(candidate.href);
        sourceUrl = pageUrl.toString();
      } else {
        const res = await fetchPublicResource(candidate.href, {
          accept: "image/*",
          maxBytes: MAX_CLIENT_LOGO_BYTES,
          what: host,
        });
        bytes = res.bytes;
        sourceUrl = res.url.toString();
      }
      if (!bytes?.length) continue;
      const contentType = sniffFileType(bytes);
      if (!contentType || !LOGO_TYPES.has(contentType) || bytes.length > MAX_CLIENT_LOGO_BYTES) continue;
      return { bytes, contentType, sourceUrl };
    } catch {
      // Try the next one.
    }
  }
  throw new ClientLogoError(
    reachError ? `Couldn't reach ${host}: ${reachError}` : `Couldn't find an icon on ${host}.`
  );
}

/** Fetches and saves the website's icon. */
export async function applyWebsiteIcon(clientId: string, website: string) {
  const icon = await findWebsiteIcon(website);
  await saveClientLogo(clientId, { ...icon, source: "website" });
}

/**
 * After a client is saved with a new website: pick up its icon, unless
 * someone uploaded a logo by hand. Best effort — failures are only logged.
 */
export async function refreshWebsiteIcon(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { website: true, logo: { select: { source: true } } },
  });
  if (!client?.website || client.logo?.source === "upload") return;
  try {
    await applyWebsiteIcon(clientId, client.website);
  } catch (err) {
    console.warn(`[client-logo] No icon for ${client.website}:`, err instanceof Error ? err.message : err);
  }
}
