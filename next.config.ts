import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

const nextConfig: NextConfig = {
  // Keep the dev badge clear of the mobile bottom tab bar.
  devIndicators: { position: "top-right" },
  // Keep nested local checkouts scoped to this repository.
  turbopack: { root: projectRoot },
  outputFileTracingRoot: projectRoot,
  // A build must never package the generated research cache or uploads.
  outputFileTracingExcludes: {
    "/*": ["./.research-cache/**/*"],
  },
};

export default nextConfig;
