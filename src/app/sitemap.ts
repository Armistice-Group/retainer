import type { MetadataRoute } from "next";

// Same reasoning as robots.ts — AUTH_URL is a runtime secret, not a build-time one.
export const dynamic = "force-dynamic";

// Matches the EFFECTIVE_DATE constants in terms/page.tsx and privacy/page.tsx.
const LEGAL_LAST_MODIFIED = new Date("2026-08-04");

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.AUTH_URL || "http://localhost:3000";
  const now = new Date();
  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/security`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/terms`, lastModified: LEGAL_LAST_MODIFIED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified: LEGAL_LAST_MODIFIED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];
}
