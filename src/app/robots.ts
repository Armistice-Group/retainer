import type { MetadataRoute } from "next";

// AUTH_URL is only injected at container runtime (from Secrets Manager), not
// at `docker build` time — force-dynamic so this reads the real value on
// every request instead of getting frozen as "localhost:3000" at build time.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.AUTH_URL || "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/terms", "/privacy"],
        disallow: ["/dashboard", "/clients", "/projects", "/time", "/invoices", "/settings", "/profile", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
