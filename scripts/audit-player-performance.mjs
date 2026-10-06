/** Read-only budgets for the initial player bundle and frozen public boards.
 * These catch weight regressions; they do not measure a physical iPad's FPS. */
import { readFileSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const budgets = { initialJsGzipBytes: 300_000, initialCssGzipBytes: 60_000,
  boardEncodedBytes: 16 * 1024 * 1024, worldEncodedBytes: 128 * 1024 * 1024,
  boardDecodedRgbaBytes: 3840 * 2160 * 4 };
const problems = [];
const build = JSON.parse(readFileSync(".next/app-build-manifest.json", "utf8"));
const page = build.pages?.["/play/[token]/page"];
if (!Array.isArray(page) || !page.length) throw Error("Completed player production build required");
const files = [...new Set([...(build.pages["/layout"] ?? []), ...page])];
const bundles = files.map(file => {
  const relative = decodeURIComponent(file).replaceAll("\\", "/");
  if (!/^static\/(?:chunks|css)\/[A-Za-z0-9_./\[\]-]+\.(?:js|css)$/.test(relative)
    || relative.split("/").includes("..")) throw Error("Unexpected player bundle path");
  const absolute = path.resolve(root, ".next", relative);
  if (!existsSync(absolute)) throw Error(`Missing player bundle: ${relative}`);
  const bytes = readFileSync(absolute);
  return { path: relative, kind: relative.endsWith(".js") ? "js" : "css",
    bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
});
const total = kind => ({ files: bundles.filter(b => b.kind === kind).length,
  bytes: bundles.filter(b => b.kind === kind).reduce((n, b) => n + b.bytes, 0),
  gzipBytes: bundles.filter(b => b.kind === kind).reduce((n, b) => n + b.gzipBytes, 0) });
const initial = { js: total("js"), css: total("css") };
if (initial.js.gzipBytes > budgets.initialJsGzipBytes) problems.push("initial player JS gzip budget exceeded");
if (initial.css.gzipBytes > budgets.initialCssGzipBytes) problems.push("initial player CSS gzip budget exceeded");
const worlds = [];
for (const manifest of ["content/adventures/wizard-refresh-art.json", "content/adventures/wizard-kingdom-art.json"]) {
  const rows = JSON.parse(readFileSync(manifest, "utf8"));
  if (rows.length !== 9) throw Error("Expected nine frozen public boards per active world");
  const boards = [];
  for (const row of rows) {
    if (!/^public\/scenes\/[a-z0-9-]+\/base\.webp$/.test(row.path)) throw Error("Unexpected public board path");
    const bytes = readFileSync(row.path);
    if (createHash("sha256").update(bytes).digest("hex") !== row.sha256) throw Error("Frozen public board changed");
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height) throw Error("Board dimensions unavailable");
    const rgbaBytes = metadata.width * metadata.height * 4;
    if (bytes.length > budgets.boardEncodedBytes) problems.push(`board transfer budget exceeded: ${row.path}`);
    if (rgbaBytes > budgets.boardDecodedRgbaBytes) problems.push(`board decoded-pixel budget exceeded: ${row.path}`);
    boards.push({ path: row.path, width: metadata.width, height: metadata.height, encodedBytes: statSync(row.path).size, decodedRgbaBytes: rgbaBytes });
  }
  const encodedBytes = boards.reduce((n, b) => n + b.encodedBytes, 0);
  if (encodedBytes > budgets.worldEncodedBytes) problems.push(`world transfer budget exceeded: ${manifest}`);
  worlds.push({ manifest, encodedBytes, boards });
}
console.log(JSON.stringify({ version: "player-performance-audit/v1", status: problems.length ? "blocked" : "pass",
  budgets, initial, bundles, worlds, problems,
  limits: ["Build manifest bytes, not measured network transfer or device FPS.",
    "RGBA is a one-buffer estimate; GPU copies and decoded patches add memory.",
    "World totals are an inventory, not proof all boards load simultaneously.",
    "Published board pixels and hashes are preserved; no lossy conversion."] }, null, 2));
if (problems.length) process.exitCode = 1;
