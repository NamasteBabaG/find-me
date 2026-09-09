/** Packaging-only normalization. Next15's Windows path.join makes recursive
 * exclusion globs ineffective, so enforce the same private/CDN rules on the
 * generated NFT manifests. No source/static/private file is changed or deleted.
 * The following audit independently rejects leaks, missing catalog or oversize. */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd(), nextRoot = path.join(root, ".next");
const catalogPath = "content/board-conditioned-qa/catalog.json";
const catalog = JSON.parse(readFileSync(path.join(root, catalogPath), "utf8"));
const assets = catalog.boards.flatMap(board => [board.board.path, ...board.slots.map(slot => slot.foreground.path)]);
if (catalog.boards.length !== 9 || assets.length !== 36 || new Set(assets).size !== 36
  || assets.some(file => !/^content\/board-conditioned-qa\/[A-Za-z0-9_-]+\/[a-z0-9-]+\/(board|foreground-[1-3])\.png$/.test(file)))
  throw new Error("Active catalog requires36 safe declared PNG paths");
const activeCatalogFiles = new Set([catalogPath, ...assets]);
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(target) : entry.isFile() ? [target] : [];
});
const manifests = walk(nextRoot).filter(file => file.endsWith(".nft.json"));
if (!manifests.length) throw new Error("No completed Next file traces to finalize");
let removed = 0, changed = 0;
for (const file of manifests) {
  const trace = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(trace.files) || !trace.files.every(item => typeof item === "string")) throw new Error("Unexpected Next trace shape");
  const retained = trace.files.filter(item => {
    const relative = path.relative(root, path.resolve(path.dirname(file), item)).split(path.sep).join("/");
    return !/^(work|storage|assets|output|tmp|\.claude|\.codex)\//.test(relative)
      && !/^\.env($|\.)/.test(relative) && !/^prisma\/[^/]+\.db(?:-journal)?$/.test(relative)
      && !/^public\/(scenes|worlds)\//.test(relative)
      && (!relative.startsWith("content/board-conditioned-qa/") || activeCatalogFiles.has(relative));
  });
  if (retained.length !== trace.files.length) {
    removed += trace.files.length - retained.length; changed++;
    writeFileSync(file, JSON.stringify({ ...trace, files: retained }));
  }
}
console.log(JSON.stringify({ version: "private-build-trace-filter/v1", manifests: manifests.length, changed, removed,
  activeCatalogRevision: catalog.revision, activeCatalogFileCount: activeCatalogFiles.size,
  privateAssetBytesRead: 0, sourceFilesChanged: 0 }));
