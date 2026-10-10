import type { NextConfig } from "next";
import { version } from "./package.json";

const nextConfig: NextConfig = {
  output: "standalone",
  // The app's version (package.json), shown at the bottom of the sidebar.
  // DOCS_URL: where "Full guide" links point (src/lib/docs-url.ts).
  env: { NEXT_PUBLIC_PACKAGE_VERSION: version, NEXT_PUBLIC_DOCS_URL: process.env.DOCS_URL ?? "" },
  experimental: {
    serverActions: {
      // Uploads (documents, receipts, résumés) go through server actions,
      // which Next caps at 1MB by default. Each action enforces its own,
      // smaller limit; this only has to be above the largest of them.
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
