/**
 * Version 4 of the first world's nine scenes: the slots changed (hand-authored
 * hides behind the board's own occluders, and the spots that were too hard
 * from the root back to their version-2 places), so games pinned to version 3
 * keep loading from an archive of it, exactly as version 2 does.
 *
 *   npx tsx scripts/release-hides.ts --write
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WRITE = process.argv.includes("--write");
const WORLD = ["newyork", "amazon", "paris", "marrakech", "giza", "tokyo", "greatwall", "sydney", "antarctica"];
const ARCHIVE = path.join(ROOT, "content", "scenes", "releases", "pre-foreground-20260907.json");

const previous = WORLD.map((slug) => JSON.parse(execSync(`git show HEAD:content/scenes/${slug}/scene.json`, { cwd: ROOT, encoding: "utf8" })) as { slug: string; version: number });
for (const p of previous) if (p.version !== 3) throw new Error(`${p.slug}: HEAD holds version ${p.version}, expected 3`);
if (existsSync(ARCHIVE)) throw new Error(`${ARCHIVE} exists; this release was already made`);
for (const slug of WORLD) {
  const file = path.join(ROOT, "content", "scenes", slug, "scene.json");
  const scene = JSON.parse(readFileSync(file, "utf8")) as { version: number };
  if (scene.version !== 3) throw new Error(`${slug}: working tree holds version ${scene.version}`);
  scene.version = 4;
  if (WRITE) writeFileSync(file, JSON.stringify(scene, null, 2) + "\n");
  console.log(`${slug}: version 4`);
}
if (WRITE) writeFileSync(ARCHIVE, JSON.stringify(previous, null, 2) + "\n", { flag: "wx" });
console.log(WRITE ? `archived nine version-3 definitions to ${path.relative(ROOT, ARCHIVE)}` : "dry run; pass --write");
