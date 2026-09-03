import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy.
 *
 * Everything the app loads is its own: the art, the sprites and the fonts are
 * served from this origin, and there is no third-party script, iframe or beacon.
 * So the policy is "self and nothing else", which is worth having even though
 * `script-src` has to allow inline: Next streams inline bootstrap scripts, and
 * nonces would mean opting every route out of static rendering. What the policy
 * does buy is that no *external* script, style, frame or connection can be
 * introduced — by an injected string, a dependency, or a mistake.
 *
 * `img-src` allows data: and blob: because the photo step previews the parent's
 * file locally before it is ever uploaded.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' data:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self'${isDev ? " ws: http://localhost:*" : ""}`,
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: csp },
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
