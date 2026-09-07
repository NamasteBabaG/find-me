/**
 * Two things the first full world-1 run (7 September, prompt v8) taught about
 * the recipes, written back into the scenes. No version bump: the art and the
 * slots' positions are unchanged, and no game was made against version 3.
 *
 * 1. A peek must show hands on the object's edge: the head alone reads as a
 *    floating sticker (giza/stones, marrakech/spices), and both the judge and
 *    Guy rejected those. Every peeking recipe now asks for the head, the top
 *    of the shoulders and both hands resting on the edge of the object.
 * 2. greatwall/dragon: the painter seated her on the hanging lantern instead
 *    of the paving. The recipe names what she must not sit on.
 *
 *   npx tsx scripts/refine-peeks.ts --write
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WRITE = process.argv.includes("--write");
const HANDS = " Show the head, the top of the shoulders and both hands resting on the edge of the object in front, so the child is visibly holding on to it; never a head alone.";
const DRAGON = " She sits on the flat stone paving of the wall's walkway, never on the hanging lantern, the pole or the dragon.";

let changed = 0;
for (const slug of ["greatwall", "newyork", "amazon", "paris", "marrakech", "giza", "tokyo", "sydney", "antarctica"]) {
  const file = path.join(ROOT, "content", "scenes", slug, "scene.json");
  const scene = JSON.parse(readFileSync(file, "utf8")) as { targets: Array<{ id: string; slots: Array<{ placement?: { pose: string; instructions: string } }> }> };
  let touched = false;
  for (const t of scene.targets) {
    const p = t.slots[0]?.placement;
    if (!p) continue;
    if (p.pose === "peeking" && !p.instructions.includes(HANDS.trim())) {
      // The bench recipe said "keep hands hidden"; the render that worked had them on the rail.
      p.instructions = p.instructions.replace(" Keep hands and lower body hidden.", " Keep the lower body hidden.") + HANDS;
      touched = true; changed++;
      console.log(`${slug}/${t.id}: hands on the edge`);
    }
    if (slug === "greatwall" && t.id === "dragon" && !p.instructions.includes(DRAGON.trim())) {
      p.instructions += DRAGON;
      touched = true; changed++;
      console.log(`${slug}/${t.id}: not on the lantern`);
    }
  }
  if (touched && WRITE) writeFileSync(file, JSON.stringify(scene, null, 2) + "\n");
}
console.log(`${changed} recipes ${WRITE ? "written" : "planned (dry run; pass --write)"}`);
