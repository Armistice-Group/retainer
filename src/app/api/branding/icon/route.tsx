import { ImageResponse } from "next/og";
import { getInstanceBranding } from "@/lib/branding";
import { ClockMarkSvg, MARK_COLORS } from "@/lib/clock-mark";

// Browser-tab icon (default), iOS home-screen icon (?kind=apple) and the
// installed app's icons (?kind=app&size=192|512, &maskable=1 for Android's
// shaped icons): the org's logo when it turned on in-app branding, else
// the clock mark. URLs are versioned by the root layout and the manifest,
// so responses can be cached forever.
const CACHE = "public, max-age=31536000, immutable";
const APPLE_SIZE = 180;
// Formats satori (ImageResponse) can rasterize for the PNG apple icon.
const RASTERIZABLE = new Set(["image/png", "image/jpeg"]);

const APP_SIZES = new Set([192, 512]);

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const kind = params.get("kind");
  const branding = await getInstanceBranding().catch(() => null);
  const logo = branding?.logoData && branding.logoContentType ? branding : null;

  if (kind === "app") {
    const size = APP_SIZES.has(Number(params.get("size"))) ? Number(params.get("size")) : 512;
    return appIcon(logo, size, params.get("maskable") === "1");
  }
  const apple = kind === "apple";

  if (logo && !apple) {
    // Browsers scale any image format for the tab icon themselves.
    return new Response(new Uint8Array(logo.logoData!), {
      headers: {
        "Content-Type": logo.logoContentType!,
        "Cache-Control": CACHE,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  }

  if (logo && apple && RASTERIZABLE.has(logo.logoContentType!)) {
    // iOS wants an opaque PNG; pad the logo onto a white square.
    const src = `data:${logo.logoContentType};base64,${Buffer.from(logo.logoData!).toString("base64")}`;
    const inner = Math.round(APPLE_SIZE * 0.78);
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by satori, not the browser */}
        <img src={src} width={inner} height={inner} style={{ objectFit: "contain" }} alt="" />
      </div>,
      { width: APPLE_SIZE, height: APPLE_SIZE, headers: { "Cache-Control": CACHE } },
    );
  }

  // Clock mark — also the apple icon for SVG/WebP logos, which satori can't
  // rasterize. iOS applies its own rounded mask, so that tile is square.
  const size = apple ? APPLE_SIZE : 32;
  return new ImageResponse(<ClockMarkSvg size={size} rounded={!apple} />, {
    width: size,
    height: size,
    headers: { "Cache-Control": CACHE },
  });
}

/**
 * A square PNG for the installed app. Android crops maskable icons to a
 * circle or squircle, keeping only the middle 80%, so the mark is inset on
 * a full-bleed tile.
 */
function appIcon(
  logo: { logoData: Uint8Array | null; logoContentType: string | null } | null,
  size: number,
  maskable: boolean
) {
  const headers = { "Cache-Control": CACHE };
  if (logo && RASTERIZABLE.has(logo.logoContentType!)) {
    const src = `data:${logo.logoContentType};base64,${Buffer.from(logo.logoData!).toString("base64")}`;
    const inner = Math.round(size * (maskable ? 0.6 : 0.78));
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by satori, not the browser */}
        <img src={src} width={inner} height={inner} style={{ objectFit: "contain" }} alt="" />
      </div>,
      { width: size, height: size, headers }
    );
  }
  if (!maskable) {
    return new ImageResponse(<ClockMarkSvg size={size} rounded />, { width: size, height: size, headers });
  }
  const inner = Math.round(size * 0.72);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: MARK_COLORS.tile,
      }}
    >
      <ClockMarkSvg size={inner} rounded={false} />
    </div>,
    { width: size, height: size, headers }
  );
}
