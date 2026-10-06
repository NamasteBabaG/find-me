/** Read-only post-Next-build deployment preflight. No env, DB, providers or
 * network. Run again on the Linux remote build to measure actual native deps. */
import { createHash, X509Certificate } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const databaseCaPath = "prisma/supabase-root-ca.crt";
const databaseSchemaPath = "prisma/generated/schema.postgres.prisma";
const usesPostgres = /provider\s*=\s*"postgresql"/.test(readFileSync("node_modules/.prisma/client/schema.prisma", "utf8"));
const databaseCa = new X509Certificate(readFileSync(databaseCaPath));
// Public trust anchor linked by Supabase's Database Settings. Pin the DER
// fingerprint, independent of checkout line endings; never accept a key file.
if (!databaseCa.ca || databaseCa.fingerprint256 !== "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA"
  || Date.parse(databaseCa.validTo) <= Date.now()) throw new Error("Expected valid public Supabase database CA");
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
const collectionManifests = ["content/adventures/wizard-art.json", "content/adventures/wizard-refresh-art.json", "content/adventures/wizard-kingdom-art.json"];
const collectionImages = collectionManifests.flatMap(file => {
  const rows = JSON.parse(readFileSync(file, "utf8"));
  if (rows.length !== 9 || new Set(rows.map(a => a.path)).size !== 9) throw new Error("Nine unique collection images required per release");
  return rows;
});
for (const image of collectionImages) if (sha(readFileSync(image.path)) !== image.sha256) throw new Error(`Collection art changed: ${image.path}`);
const expectedCollection = collectionManifests.map(file => path.resolve(file));
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
    databaseCaTraced: paths.has(path.resolve(databaseCaPath)),
    databaseSchemaTraced: paths.has(path.resolve(databaseSchemaPath)),
    catalogFiles: expected.filter(file => paths.has(file)).length,
    localPatchFiles: expectedLocalPatch.filter(file => paths.has(file)).length,
    collectionFiles: expectedCollection.filter(file => paths.has(file)).length,
    missingFiles, privateFiles, staleCatalogFiles,
    publicCdnFiles: [...paths].filter(file => /^public\/(scenes|worlds)\//.test(rel(file)) && !expectedCollection.includes(file)).length };
});
const jobs = routes.find(route => route.manifest === ".next/server/app/api/jobs/tick/route.js.nft.json");
const problems = [];
for (const route of ["api/health", "api/jobs/tick"]) {
  if (!routes.find(row => row.manifest === `.next/server/app/${route}/route.js.nft.json`)?.databaseCaTraced)
    problems.push(`database trust certificate missing from ${route} runtime`);
  if (usesPostgres && !routes.find(row => row.manifest === `.next/server/app/${route}/route.js.nft.json`)?.databaseSchemaTraced)
    problems.push(`Postgres source schema directory missing from ${route} TLS runtime`);
}
if (!jobs || jobs.catalogFiles !== 37) problems.push("generation route does not trace all36 static PNGs pluscatalog");
if (!jobs || jobs.localPatchFiles !== 10) problems.push("generation route does not trace nine local-patch base images plus manifest");
if (!jobs || jobs.collectionFiles !== collectionManifests.length) problems.push("generation route must trace historical journey, refreshed journey and kingdom collection hash manifests");
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
