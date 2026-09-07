/**
 * Install the occluder polygons of the first world's placements: the object in
 * front of a peek (a bench back, a barrel, a wall), as Sol drew it in the
 * one-time planning run (output/journey-fixed-plans-20260907, frozen). The
 * paint mask leaves the polygon out, a render that changes what is inside it
 * is refused, and the matte is clipped by it (see docs/SPRITE_PATCHES.md).
 *
 * Only placements whose position was NOT moved by an override in
 * install-fixed-plans.ts get their polygon: a polygon drawn for a spot the
 * child no longer stands at would guard the wrong object.
 *
 * The scene version is not bumped: the art and the slots are unchanged, and
 * no game was made against version 3 without the polygons.
 *
 *   npx tsx scripts/install-occluders.ts            # dry run
 *   npx tsx scripts/install-occluders.ts --write
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PLAN = path.join(ROOT, "output", "journey-fixed-plans-20260907");
const WRITE = process.argv.includes("--write");
/** Moved by an override; Sol's polygon belongs to the spot they were moved away from. */
const MOVED = new Set(["marrakech/spices", "greatwall/tower", "sydney/rocks"]);
const r4 = (v: number) => Math.round(v * 10000) / 10000;

const inputs = JSON.parse(readFileSync(path.join(PLAN, "inputs.json"), "utf8")) as Array<{ slug: string }>;
let written = 0;
for (const { slug } of inputs) {
  const scenePath = path.join(ROOT, "content", "scenes", slug, "scene.json");
  const scene = JSON.parse(readFileSync(scenePath, "utf8")) as { targets: Array<{ id: string; slots: Array<{ placement?: Record<string, unknown> }> }> };
  const plan = JSON.parse(readFileSync(path.join(PLAN, "calls", slug, "result.json"), "utf8")) as { placements: Array<{ targetId: string; foregroundPolygon?: Array<{ x: number; y: number }> }> };
  let changed = false;
  for (const p of plan.placements) {
    const key = `${slug}/${p.targetId}`;
    const poly = p.foregroundPolygon ?? [];
    if (poly.length < 3 || MOVED.has(key)) { console.log(`${key.padEnd(22)} ${poly.length < 3 ? "no polygon" : "moved by an override; polygon skipped"}`); continue; }
    const slot = scene.targets.find((t) => t.id === p.targetId)?.slots[0];
    if (!slot?.placement) throw new Error(`${key}: no placement to attach the polygon to`);
    slot.placement.foreground = poly.map((q) => ({ x: r4(q.x), y: r4(q.y) }));
    console.log(`${key.padEnd(22)} ${poly.length} points`);
    changed = true;
    written++;
  }
  if (changed && WRITE) writeFileSync(scenePath, JSON.stringify(scene, null, 2) + "\n");
}
console.log(`${written} polygons ${WRITE ? "written" : "planned (dry run; pass --write)"}`);
