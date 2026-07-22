import type { NextConfig } from "next";

// Strict checks in production/CI; looser in local development.
const isStrictBuild = process.env.NODE_ENV === "production" || process.env.CI === "true";

const nextConfig: NextConfig = {
  // Static export for Cloudflare Pages / any static host.
  output: "export",
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: !isStrictBuild,
  },
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: !isStrictBuild,
  },
};

export default nextConfig;