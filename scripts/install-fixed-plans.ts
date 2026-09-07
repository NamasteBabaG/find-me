/**
 * Install the vetted hiding-spot placements for the first world into the
 * scenes: slot A of every target gets its position, size, hint zone and a
 * placement recipe (pose, support, occlusion, instructions) that the paint
 * prompt reads (see slotPrompt). Variant B is untouched.
 *
 * The recipes come from the one-time Sol HIGH planning run
 * (output/journey-fixed-plans-20260907, paid, frozen) — every proposal was
 * looked at on the board first, and the ones that collided with existing
 * figures are replaced by the OVERRIDES below, written after zooming in:
 *
 *   newyork/pretzel     Sol's foot point stood on a small existing girl.
 *   greatwall/tower     Sol's window already holds two painted children.
 *   marrakech/spices    the head landed on the vendor's arm and cup.
 *   antarctica/penguins the box sat on a penguin; moved to open snow.
 *   sydney/rocks        nudged off the crawling boy's hand.
 *
 * How a recipe becomes a slot: the mask ellipse is centred on the VISIBLE box
 * (that is where paint should land), its size is the child's implied full
 * height — except for a peek, where the ellipse hugs the visible head and
 * shoulders so the occluder in front is not repainted. The hint glow follows
 * the slot. The scene version is bumped: a slot is authored against one
 * exact board, and a future art refresh has to re-earn it.
 *
 *   npx tsx scripts/install-fixed-plans.ts            # dry run: print the changes
 *   npx tsx scripts/install-fixed-plans.ts --write    # write the nine scene.json files
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PLAN = path.join(ROOT, "output", "journey-fixed-plans-20260907");
const WRITE = process.argv.includes("--write");

type Pose = "standing" | "seated" | "crouching" | "swimming" | "peeking";
interface Proposal {
  targetId: string;
  usable: boolean;
  pose: Pose;
  footX: number;
  footY: number;
  bodyHeight: number;
  visibleBox: { x: number; y: number; w: number; h: number };
  support: string;
  occlusion: string;
  instructions: string;
}
interface Override extends Partial<Proposal> {
  mission?: { en: string; he: string };
  hintText?: { en: string; he: string };
}

const OVERRIDES: Record<string, Override> = {
  "newyork/pretzel": {
    pose: "standing", footX: 0.597, footY: 0.915, bodyHeight: 0.14,
    visibleBox: { x: 0.575, y: 0.775, w: 0.044, h: 0.14 },
    support: "Both shoes on the paved sidewalk in front of the cart's right lower panel, between the small girl on the left and the vendor on the right.",
    occlusion: "None; the child stands in front of the cart and may cover part of its lower panel, bottles and wheel.",
    instructions: "A school-age child stands facing the pretzel cart, in the narrow gap between the small girl in the purple top on the left and the vendor in the apron on the right. Do not touch or merge with either of them; only the cart is behind the child.",
  },
  "greatwall/tower": {
    pose: "standing", footX: 0.085, footY: 0.53, bodyHeight: 0.075,
    visibleBox: { x: 0.068, y: 0.455, w: 0.034, h: 0.075 },
    support: "Both shoes on the empty stone steps at the foot of the watchtower, in the tower's shadow.",
    occlusion: "None; the low stone parapet on the right may overlap a shoe only.",
    instructions: "A small child stands on the empty flight of stone steps beside the watchtower, below the children higher up the stairs, looking up at the tower. Use the height of the children on the stairs, not the adults. Do not touch the children on the steps above.",
    mission: { en: "Find {name} at the watchtower", he: "מצאו את {name} ליד מגדל השמירה" },
    hintText: { en: "Look at the steps beside the watchtower.", he: "חפשו במדרגות ליד מגדל השמירה." },
  },
  "marrakech/spices": {
    pose: "peeking", footX: 0.487, footY: 0.66, bodyHeight: 0.11,
    visibleBox: { x: 0.472, y: 0.548, w: 0.032, h: 0.05 },
    support: "Hidden feet on the ground behind the blue-and-white patterned barrel; the child stands normally there.",
    occlusion: "The blue-and-white patterned barrel in front hides the child from the chest down; only the head and shoulders show above its rim.",
    instructions: "A child peeks out above the blue-and-white patterned barrel that stands in front of the yellow spice cone, between the vendor in the cream robe on the left and the vendor in the green robe on the right. Only the head and shoulders are visible above the barrel; keep the whole face clear and do not touch either vendor.",
  },
  "antarctica/penguins": {
    pose: "standing", footX: 0.435, footY: 0.8, bodyHeight: 0.108,
    visibleBox: { x: 0.414, y: 0.692, w: 0.042, h: 0.108 },
    support: "Both boots on the open snow just left of the penguin line, below the sledge dog.",
    occlusion: "None; the complete child is visible, standing beside the penguins without covering any of them.",
    instructions: "A child in winter clothes stands on open snow to the left of the marching penguins, facing them, at the same size as the nearby children. Do not cover any penguin or child.",
  },
  "sydney/rocks": {
    footX: 0.785, footY: 0.972,
    visibleBox: { x: 0.766, y: 0.812, w: 0.047, h: 0.11 },
  },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r4 = (v: number) => Math.round(v * 10000) / 10000;

function slotFor(p: Proposal) {
  const vb = p.visibleBox;
  const x = r4(vb.x + vb.w / 2);
  const y = r4(vb.y + vb.h / 2);
  // A peek: the mask hugs what shows, so the occluder in front is not repainted.
  const scale = r4(p.pose === "peeking" ? clamp(vb.h * 1.5, 0.03, p.bodyHeight) : clamp(p.bodyHeight, 0.03, 0.25));
  const instructions = p.pose === "peeking" ? `${p.instructions} Only the part of the child above the occluder is painted; the rest of the body continues behind it and is not shown.` : p.instructions;
  return { x, y, scale, placement: { pose: p.pose, support: p.support, occlusion: p.occlusion, instructions } };
}

const inputs = JSON.parse(readFileSync(path.join(PLAN, "inputs.json"), "utf8")) as Array<{ slug: string; targets: string[] }>;
let changed = 0;
for (const input of inputs) {
  const scenePath = path.join(ROOT, "content", "scenes", input.slug, "scene.json");
  const scene = JSON.parse(readFileSync(scenePath, "utf8")) as { version: number; targets: Array<{ id: string; mission: { en: string; he: string }; slots: Array<Record<string, unknown>> }> };
  const plan = JSON.parse(readFileSync(path.join(PLAN, "calls", input.slug, "result.json"), "utf8")) as { placements: Proposal[] };
  for (const proposal of plan.placements) {
    const key = `${input.slug}/${proposal.targetId}`;
    const override = OVERRIDES[key] ?? {};
    const p: Proposal = { ...proposal, ...override, visibleBox: override.visibleBox ?? proposal.visibleBox };
    if (!p.usable && !OVERRIDES[key]) throw new Error(`${key}: Sol marked it unusable and no override exists`);
    const target = scene.targets.find((t) => t.id === p.targetId);
    if (!target) throw new Error(`${key}: no such target in the scene`);
    const slot = target.slots[0]!;
    const next = slotFor(p);
    const hz = slot.hintZone as { x: number; y: number; r: number };
    const before = `${slot.x},${slot.y},${slot.scale}${slot.placement ? " +placement" : ""}`;
    Object.assign(slot, { x: next.x, y: next.y, scale: next.scale, placement: next.placement, hintZone: { x: next.x, y: r4(clamp(next.y - 0.015, 0, 1)), r: hz.r } });
    if (override.mission) target.mission = override.mission;
    if (override.hintText) slot.hintText = override.hintText;
    console.log(`${key.padEnd(24)} ${p.pose.padEnd(9)} ${before}  ->  ${next.x},${next.y},${next.scale}${OVERRIDES[key] ? "  (override)" : ""}`);
    changed++;
  }
  scene.version += 1;
  if (WRITE) writeFileSync(scenePath, JSON.stringify(scene, null, 2) + "\n");
}
console.log(`${changed} slots ${WRITE ? "written" : "planned (dry run; pass --write)"}`);
