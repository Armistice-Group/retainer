import type { MetadataRoute } from "next";

// Self-hosted instances are private workspaces — nothing here should be indexed.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
