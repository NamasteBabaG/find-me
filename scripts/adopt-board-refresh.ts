/** One explicit content release from saved, user-selected renders; no API calls.
 * Raw renders and old runtime URLs stay untouched. --apply is required to write.
 * The archive makes resuming old GameScene.sceneVersion rows deterministic.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";

const root = process.cwd();
const run = path.join(root, "output/imagegen/boards-refresh-2026-09-06");
const archivePath = path.join(root, "content/scenes/releases/pre-refresh-20260907.json");
const releasePath = path.join(root, "content/scenes/releases/refresh-20260907.json");
const read = (file: string) => JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function main() {
  if (process.argv.includes("--apply") && existsSync(releasePath)) {
    throw new Error("This release is complete. Refusing to overwrite later slot edits; create a new versioned release instead.");
  }
  const m = read(path.join(run, "manifest.json"));
  const sources: Array<{ slug: string; source: string; sha256: string }> = m.boards.map((b: { slug: string }) => ({
    slug: b.slug, source: path.join(run, b.slug, "board-v1.png"), sha256: read(path.join(run, b.slug, "evidence.json")).sha256,
  }));
  sources.push({ slug: "sydney", source: path.join(root, "output/imagegen/sydney-v4-local-2026-09-06/sydney-A.png"), sha256: "d57668e72698c8a06341c4c187e4314e9d4f0f8c09896ab1fc9d4a579cd90cd0" });
  if (sources.length !== 27 || new Set(sources.map(s => s.slug)).size !== 27) throw new Error("Expected 27 unique boards");
  const previous = existsSync(archivePath) ? read(archivePath) : sources.map(s => read(path.join(root, "content/scenes", s.slug, "scene.json")));
  const plans = [];
  for (const s of sources) {
    const buffer = readFileSync(s.source);
    if (hash(buffer) !== s.sha256) throw new Error("Render hash changed: " + s.slug);
    const meta = await sharp(buffer).metadata();
    if (meta.width !== 3072 || meta.height !== 2048) throw new Error("Unexpected dimensions: " + s.slug);
    const old = previous.find((p: { slug: string }) => p.slug === s.slug);
    if (!old) throw new Error("Missing previous definition: " + s.slug);
    const current = read(path.join(root, "content/scenes", s.slug, "scene.json"));
    const prefix = `/scenes/${s.slug}/refresh-20260907`;
    if (current.version !== old.version && !(current.version === old.version + 1 && current.art.base === `${prefix}/base.webp`)) throw new Error("Concurrent content change: " + s.slug);
    plans.push({ ...s, old, prefix, nextVersion: old.version + 1 });
  }
  if (!process.argv.includes("--apply")) { console.log(JSON.stringify({ mode: "dry-run", boards: plans.map(p => ({ slug: p.slug, oldVersion: p.old.version, newVersion: p.nextVersion, sourceSha256: p.sha256 })), oldAssetsPreserved: true })); return; }
  mkdirSync(path.dirname(archivePath), { recursive: true });
  if (!existsSync(archivePath)) writeFileSync(archivePath, JSON.stringify(previous, null, 2) + "\n", { flag: "wx" });
  const release = [];
  for (const p of plans) {
    const dir = path.join(root, "public", p.prefix);
    mkdirSync(dir, { recursive: true });
    const base = await sharp(p.source).webp({ quality: 95, effort: 6 }).toBuffer();
    const thumb = await sharp(p.source).resize({ width: 480 }).webp({ quality: 88 }).toBuffer();
    for (const [name, buffer] of [["base.webp", base], ["thumb.webp", thumb]] as const) {
      const file = path.join(dir, name);
      if (existsSync(file)) { if (hash(readFileSync(file)) !== hash(buffer)) throw new Error("Refusing asset overwrite: " + file); }
      else writeFileSync(file, buffer, { flag: "wx" });
    }
    const next = structuredClone(p.old);
    next.version = p.nextVersion;
    next.art.base = `${p.prefix}/base.webp`;
    next.art.thumbnail = `${p.prefix}/thumb.webp`;
    next.art.sha256 = hash(base);
    // An old foreground is painted in the old board's coordinates. Natural
    // occlusion must now be generated against the NEW base, not pasted over it.
    delete next.art.foreground;
    for (const t of next.targets) for (const slot of t.slots) slot.layer = "front";
    writeFileSync(path.join(root, "content/scenes", p.slug, "scene.json"), JSON.stringify(next, null, 2) + "\n");
    release.push({ slug: p.slug, previousVersion: p.old.version, version: p.nextVersion, sourceSha256: p.sha256, runtimeSha256: hash(base), runtimeBytes: base.length, base: next.art.base, thumbnail: next.art.thumbnail });
    console.log(`${p.slug}: version ${p.nextVersion}, ${base.length} bytes`);
  }
  writeFileSync(releasePath, JSON.stringify({ id: "refresh-20260907", userAcceptedArtWithKnownDefects: true, slotCertification: "pending", oldAssetsPreserved: true, boards: release }, null, 2) + "\n");
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
