import type { MetadataRoute } from "next";

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
