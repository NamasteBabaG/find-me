import type { NextConfig } from "next";

/**
 * Security headers for every route. CSP carries only frame-ancestors on purpose:
 * a script-src policy would break Next's dev tooling; the rest is handled by
 * the private links + signed asset URLs.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Scene art and child sprites are served through our own asset route,
  // so we do not need remote image patterns yet.
  images: { unoptimized: true },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
