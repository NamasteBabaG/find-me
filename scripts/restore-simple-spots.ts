/**
 * Hiding spots that are too hard from the root go back to the placements
 * that always worked: the positions of scene version 2 (the 6 September game:
 * 27 of 27 painted for $1.58), with no placement recipe, so the painter is
 * asked for a whole child in the open. Guy's rule, 7 September: a spot that
 * is hard from the root is replaced, not insisted on. The planning run's
 * peeks with no usable occluder (its polygons were a sliver of root, a piece
 * of foliage, a man's trousers) and the swimmer that failed six rolls in a
 * row are the ones.
 *
 *   npx tsx scripts/restore-simple-spots.ts --write
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WRITE = process.argv.includes("--write");
const RESTORE = ["amazon/roots", "amazon/canoe", "tokyo/stall", "antarctica/ice", "marrakech/spices", "sydney/rocks", "newyork/bench"];
/** Standing spots whose planning-run polygon is not an occluder: keep the recipe, drop the polygon. */
const DROP_POLYGON: string[] = [];

const archive = JSON.parse(readFileSync(path.join(ROOT, "content", "scenes", "releases", "pre-placement-20260907.json"), "utf8")) as Array<{ slug: string; targets: Array<{ id: string; slots: Array<Record<string, unknown>> }> }>;
const touched = new Map<string, unknown>();
for (const key of [...RESTORE, ...DROP_POLYGON]) {
  const [slug, targetId] = key.split("/") as [string, string];
  const scenePath = path.join(ROOT, "content", "scenes", slug, "scene.json");
  const scene = (touched.get(slug) as { targets: Array<{ id: string; slots: Array<Record<string, unknown>> }> } | undefined) ?? (JSON.parse(readFileSync(scenePath, "utf8")) as { targets: Array<{ id: string; slots: Array<Record<string, unknown>> }> });
  touched.set(slug, scene);
  const target = scene.targets.find((t) => t.id === targetId);
  if (!target) throw new Error(`${key}: no such target`);
  const slot = target.slots[0]!;
  if (RESTORE.includes(key)) {
    const old = archive.find((s) => s.slug === slug)?.targets.find((t) => t.id === targetId)?.slots[0];
    if (!old) throw new Error(`${key}: no version-2 slot in the archive`);
    for (const k of ["x", "y", "scale", "hintZone", "layer", "flip"] as const) if (old[k] !== undefined) slot[k] = old[k];
    delete slot.placement;
    console.log(`${key.padEnd(20)} restored to version 2: ${old.x},${old.y},${old.scale}`);
  } else {
    const p = slot.placement as { foreground?: unknown } | undefined;
    if (p) delete p.foreground;
    console.log(`${key.padEnd(20)} polygon dropped`);
  }
}
if (WRITE) for (const [slug, scene] of touched) writeFileSync(path.join(ROOT, "content", "scenes", slug, "scene.json"), JSON.stringify(scene, null, 2) + "\n");
console.log(WRITE ? "written" : "dry run; pass --write");
