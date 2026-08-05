import type { MetadataRoute } from "next";

// Same reasoning as robots.ts — AUTH_URL is a runtime secret, not a build-time one.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.AUTH_URL || "http://localhost:3000";
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/security`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/login`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/signup`, changeFrequency: "monthly", priority: 0.7 },
  ];
}
