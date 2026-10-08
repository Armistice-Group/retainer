import { ImageResponse } from "next/og";
import { getInstanceBranding } from "@/lib/branding";
import { ClockMarkSvg } from "@/lib/clock-mark";

// Browser-tab icon (default) and iOS home-screen icon (?kind=apple): the
// org's logo when it turned on in-app branding, else the clock mark. URLs
// are versioned by the root layout (see generateMetadata), so responses can
// be cached forever.
const CACHE = "public, max-age=31536000, immutable";
const APPLE_SIZE = 180;
// Formats satori (ImageResponse) can rasterize for the PNG apple icon.
const RASTERIZABLE = new Set(["image/png", "image/jpeg"]);

export async function GET(req: Request) {
  const apple = new URL(req.url).searchParams.get("kind") === "apple";
  const branding = await getInstanceBranding().catch(() => null);
  const logo = branding?.logoData && branding.logoContentType ? branding : null;

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
