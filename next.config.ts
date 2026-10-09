import type { NextConfig } from "next";
import { version } from "./package.json";

const nextConfig: NextConfig = {
  output: "standalone",
  // The app's version (package.json), shown at the bottom of the sidebar.
  env: { NEXT_PUBLIC_PACKAGE_VERSION: version },
};

export default nextConfig;
