import type { MetadataRoute } from "next";
import { getInstanceBranding, iconVersion } from "@/lib/branding";

// Read per request: the name and icons follow the org's branding, which
// isn't known at build time.
export const dynamic = "force-dynamic";

/**
 * Makes Consultainer installable (Android's "Install app"). It opens on the
 * phone view (/m), offers shortcuts from a long-press on the icon, and puts
 * the app in the share sheet so a screenshot can be sent straight in as
 * evidence (handled by the service worker, public/sw.js).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [branding, v] = await Promise.all([getInstanceBranding().catch(() => null), iconVersion()]);
  const name = branding?.name ?? "Consultainer";
  const icon = (size: number, maskable = false) => ({
    src: `/api/branding/icon?kind=app&size=${size}${maskable ? "&maskable=1" : ""}&v=${v}`,
    sizes: `${size}x${size}`,
    type: "image/png",
    purpose: maskable ? ("maskable" as const) : ("any" as const),
  });

  return {
    id: "/m",
    name,
    short_name: name.length > 12 ? "Consultainer" : name,
    description: "Time, timer and evidence on the go.",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafafa",
    theme_color: "#18181b",
    icons: [icon(192), icon(512), icon(192, true), icon(512, true)],
    shortcuts: [
      { name: "Log time", url: "/m?log=1" },
      { name: "Timer", url: "/m" },
    ],
    share_target: {
      action: "/m/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        files: [{ name: "files", accept: ["image/*", "application/pdf"] }],
      },
    },
  };
}
