/** Read-only post-Next-build deployment preflight. No env, DB, providers or
 * network. Run again on the Linux remote build to measure actual native deps. */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const rel = file => path.relative(root, file).split(path.sep).join("/");
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : path.join(dir, entry.name));
const catalogPath = "content/board-conditioned-qa/catalog.json";
const catalogBytes = readFileSync(catalogPath), catalog = JSON.parse(catalogBytes.toString("utf8"));
const images = catalog.boards.flatMap(board => [board.board, ...board.slots.map(slot => slot.foreground)]);
if (catalog.boards.length !== 9 || images.length !== 36 || new Set(images.map(i => i.path)).size !== 36) throw new Error("Expected nine boards plus27 individual foreground PNGs");
for (const image of images) if (sha(readFileSync(image.path)) !== image.sha256) throw new Error(`Catalog static image hash differs: ${image.path}`);
const expected = [catalogPath, ...images.map(i => i.path)].map(file => path.resolve(file));
const localPatchArtPath = "content/local-patch-world/art.json";
const localPatchArt = JSON.parse(readFileSync(localPatchArtPath, "utf8"));
const localPatchPublic = localPatchArt.boards.map(board => `public${board.base}`);
if (localPatchPublic.length !== 9 || new Set(localPatchPublic).size !== 9
  || localPatchPublic.some(file => !/^public\/scenes\/[a-z]+\/(refresh-20260907|local-patch-20260912)\/base\.webp$/.test(file)))
  throw new Error("Expected nine safe local-patch base images");
for (const board of localPatchArt.boards) {
  const publicBytes = readFileSync(`public${board.base}`);
  if (sha(publicBytes) !== board.sha256) throw new Error(`Local-patch art hash differs: ${board.board}`);
  const source = localPatchArt.renderSources.find(row => row.board === board.board);
  if (!source || !expected.includes(path.resolve(source.path))) throw new Error(`Local-patch source is not traced: ${board.board}`);
  const sourceBytes = readFileSync(source.path);
  if (sha(sourceBytes) !== source.sha256) throw new Error(`Local-patch source hash differs: ${board.board}`);
  const publicPixels = await sharp(publicBytes).ensureAlpha().raw().toBuffer();
  const sourcePixels = await sharp(sourceBytes).ensureAlpha().raw().toBuffer();
  if (!publicPixels.equals(sourcePixels) || sha(sourcePixels) !== source.pixelsSha256)
    throw new Error(`Local-patch published and renderer pixels differ: ${board.board}`);
}
const expectedLocalPatch = [localPatchArtPath, ...localPatchArt.renderSources.map(source => source.path)].map(file => path.resolve(file));
const manifests = walk(path.join(root, ".next")).filter(file => file.endsWith(".nft.json"));
const routes = manifests.map(manifest => {
  const paths = new Set(JSON.parse(readFileSync(manifest, "utf8")).files.map(file => path.resolve(path.dirname(manifest), file)));
  const entrypoint = manifest.replace(/\.nft\.json$/, "");
  if (existsSync(entrypoint)) paths.add(entrypoint);
  const privateFiles = [...paths].map(rel).filter(file => /^(work|storage|assets|output|tmp|\.claude|\.codex)\//.test(file)
    || /^\.env($|\.)/.test(file) || /^prisma\/[^/]+\.db(?:-journal)?$/.test(file));
  const missingFiles = [...paths].filter(file => !existsSync(file)).map(rel);
  const staleCatalogFiles = [...paths].filter(file => rel(file).startsWith("content/board-conditioned-qa/") && !expected.includes(file)).map(rel);
  const bytes = [...paths].reduce((sum, file) => sum + (existsSync(file) ? statSync(file).size : 0), 0);
  return { manifest: rel(manifest), tracedFiles: paths.size, uncompressedBytes: bytes,
    catalogFiles: expected.filter(file => paths.has(file)).length,
    localPatchFiles: expectedLocalPatch.filter(file => paths.has(file)).length,
    missingFiles, privateFiles, staleCatalogFiles,
    publicCdnFiles: [...paths].map(rel).filter(file => /^public\/(scenes|worlds)\//.test(file)).length };
});
const jobs = routes.find(route => route.manifest === ".next/server/app/api/jobs/tick/route.js.nft.json");
const problems = [];
if (!jobs || jobs.catalogFiles !== 37) problems.push("generation route does not trace all36 static PNGs pluscatalog");
if (!jobs || jobs.localPatchFiles !== 10) problems.push("generation route does not trace nine local-patch base images plus manifest");
if (routes.some(route => route.privateFiles.length)) problems.push("private local files or dotenv were traced");
if (routes.some(route => route.missingFiles.length)) problems.push("trace references missing files");
if (routes.some(route => route.publicCdnFiles)) problems.push("undeclared public CDN scene art duplicated inside server function");
if (routes.some(route => route.staleCatalogFiles.length)) problems.push("inactive board catalog revision or undeclared asset duplicated inside server function");
// Conservative decimal250MB budget; platform wrappers and Linux native libs
// still need independent confirmation on the actual remote build.
if (routes.some(route => route.uncompressedBytes >= 250_000_000)) problems.push("function trace closure reaches conservative250MB limit");
const report = { version: "board-catalog-tracing-audit/v1", status: problems.length ? "blocked" : "pass", platform: process.platform,
  catalogRevision: catalog.revision, catalogSha256: sha(catalogBytes), nextConfigSha256: sha(readFileSync("next.config.ts")),
  boards: catalog.boards.length, slots: images.length - catalog.boards.length, staticPngCount: images.length,
  staticBytes: images.reduce((sum, image) => sum + statSync(image.path).size, 0),
  tracedRoutes: routes.length, jobs, largest: [...routes].sort((a, b) => b.uncompressedBytes - a.uncompressedBytes).slice(0, 5),
  privateLeaks: routes.filter(route => route.privateFiles.length), problems,
  measurement: "deduplicated route NFT closure plusentrypoint; not a remote Vercel function artifact", automaticRelease: false };
console.log(JSON.stringify(report, null, 2));
if (problems.length) process.exitCode = 1;
