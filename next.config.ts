import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Scene art and child sprites are served through our own asset route,
  // so we do not need remote image patterns yet.
  images: { unoptimized: true },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
