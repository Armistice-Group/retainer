import "server-only";
import { prisma } from "@/lib/prisma";
import type { Organization } from "@/generated/prisma/client";

type LogoFields = Pick<Organization, "id" | "logoData" | "logoUrl" | "updatedAt">;

/** URL for the org's logo in the app chrome — the cached logo route for an
 * uploaded image (versioned so a new upload busts caches), or the external
 * URL if that's what the org has. */
export function orgLogoUrl(org: LogoFields) {
  if (org.logoData) return `/api/branding/logo/${org.id}?v=${org.updatedAt.getTime()}`;
  return org.logoUrl ?? null;
}

/** The org whose branding the (pre-login) auth pages show: the first one
 * that opted in. A self-hosted instance almost always has exactly one. */
export async function getInstanceBranding() {
  return prisma.organization.findFirst({
    where: { appBranding: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      logoData: true,
      logoContentType: true,
      logoUrl: true,
      updatedAt: true,
      brandColor: true,
      appAccentFromBrand: true,
    },
  });
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** CSS overriding the accent tokens with an org's brand color. The color is
 * nudged per theme so it keeps contrast: lightened on the near-black dark
 * background if it's dark, darkened on white if it's very light. */
export function brandAccentCss(color: string | null | undefined) {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
  const lum = luminance(color);
  const light = lum > 0.55 ? `color-mix(in oklch, ${color} 65%, black)` : color;
  const dark = lum < 0.2 ? `color-mix(in oklch, ${color} 70%, white)` : color;
  const fgOn = (l: number) => (l > 0.45 ? "#09090b" : "#ffffff");
  const lightFg = lum > 0.55 ? "#ffffff" : fgOn(lum);
  const darkFg = lum < 0.2 ? "#09090b" : fgOn(lum);
  const vars = (c: string, fg: string) =>
    `--brand:${c};--brand-foreground:${fg};--ring:${c};--sidebar-ring:${c};--chart-1:${c};`;
  // :root / :root.dark outrank the defaults in globals.css (:root / .dark).
  return `:root{${vars(light, lightFg)}}:root.dark{${vars(dark, darkFg)}}`;
}

/** Version token for icon URLs: changes whenever the branded org (or its
 * logo) changes, so browsers fetch the new icon instead of a cached one. */
export async function iconVersion() {
  try {
    const branding = await getInstanceBranding();
    return branding?.logoData ? `${branding.id}-${branding.updatedAt.getTime()}` : "default";
  } catch {
    return "default";
  }
}
