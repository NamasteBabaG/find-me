import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

const isDev = process.env.NODE_ENV !== "production";
const tracingExcludedDirectories = ["work", "storage", "assets", "output", "tmp", ".claude", "public/scenes", "public/worlds"];
const tracingExcludes = [...tracingExcludedDirectories.map(directory => `./${directory}/**/*`),
  "./.env", "./.env.*", "./prisma/*.db", "./prisma/*.db-journal"];
const activeBoardCatalogPath = "content/board-conditioned-qa/catalog.json";
const activeBoardCatalog = JSON.parse(readFileSync(activeBoardCatalogPath, "utf8")) as {
  boards: { board: { path: string }; slots: { foreground: { path: string } }[] }[];
};
const activeBoardAssetPaths = activeBoardCatalog.boards.flatMap(board => [board.board.path, ...board.slots.map(slot => slot.foreground.path)]);
const localPatchArtPath = "content/local-patch-world/art.json";
const localPatchArt = JSON.parse(readFileSync(localPatchArtPath, "utf8")) as { renderSources: { path: string }[] };
const localPatchArtPaths = localPatchArt.renderSources.map(source => source.path);
if (localPatchArtPaths.length !== 9 || new Set(localPatchArtPaths).size !== 9
  || localPatchArtPaths.some(file => !activeBoardAssetPaths.includes(file)))
  throw new Error("Exactly nine safe non-personalized local-patch board paths required for tracing");
if (activeBoardCatalog.boards.length !== 9 || activeBoardAssetPaths.length !== 36 || new Set(activeBoardAssetPaths).size !== 36
  || activeBoardAssetPaths.some(file => !/^content\/board-conditioned-qa\/[A-Za-z0-9_-]+\/[a-z0-9-]+\/(board|foreground-[1-3])\.png$/.test(file)))
  throw new Error("Exactly36 safe active board-catalog PNG paths required for tracing");

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
  // Only child-free frozen world inputs. Private work/, uploads and pilot
  // imagery are never part of a deployment. Dynamic fs reads need tracing.
  outputFileTracingIncludes: {
    "/*": [activeBoardCatalogPath, ...activeBoardAssetPaths, localPatchArtPath, ...localPatchArtPaths].map(file => `./${file}`),
  },
  outputFileTracingExcludes: {
    // Local-only preview routes and Prisma's dotenv fallback otherwise cause
    // the tracer to collect private files that must NEVER ship in a function.
    // Local patches reuse the already-traced PNG sources with exactly identical
    // decoded pixels. Public WebP copies stay on the CDN, never duplicated here.
    // public/demo metadata stays local for the landing-page demo.
    "/*": tracingExcludes,
  },
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
