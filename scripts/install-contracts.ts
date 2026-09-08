/**
 * The placement contracts of 8 September 2026, and the two spots that
 * moved: sydney/ferry → sydney/lifeguard (a bust at the ferry's bow came
 * back three times the size of its passengers, whose heads are ~40 px; no
 * child-sized child is recognisable there), and paris/awning, which stands
 * behind the painter's easel now (scripts/author-hides.ts writes the layer).
 *
 * Every number was measured by a person on the board's own people, in
 * work/codex-judge-audit-20260908/zooms and matrix (the review matrix in
 * docs/CLAUDE_JUDGE_PLACEMENT_FIX_REPORT_2026-09-08.md). Scenes that change
 * are archived first (content/scenes/releases/pre-contract-20260908.json,
 * registered in content/scenes/index.ts) and bumped to version 5, so game 2
 * keeps resolving version 4 exactly.
 *
 *   npx tsx scripts/install-contracts.ts            # dry run: prints what would change
 *   npx tsx scripts/install-contracts.ts --write
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WRITE = process.argv.includes("--write");
const ARCHIVE = path.join(ROOT, "content", "scenes", "releases", "pre-contract-20260908.json");

interface Contract { standingHeight: number; visibleFraction: number; supportPoint: { x: number; y: number }; comparators: string }
type Slot = Record<string, unknown> & { id: string; x: number; y: number; scale: number; layer?: string; hintZone: { x: number; y: number; r: number }; hintText: { en: string; he: string }; placement?: Record<string, unknown> & { contract?: Contract } };
type Target = Record<string, unknown> & { id: string; targetType: string; bodyTemplate: string; difficulty: number; mission: { en: string; he: string }; item: { en: string; he: string }; success: Array<{ en: string; he: string }>; animation: string; slots: [Slot, Slot]; action?: string; expression?: string };
type Scene = Record<string, unknown> & { slug: string; version: number; art: { width: number; height: number; base: string; foreground?: string }; targets: Target[] };

const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** Art fractions from board pixels on the 3072x2048 art. */
const px = (x: number, y: number) => ({ x: r4(x / 3072), y: r4(y / 2048) });

/** slug/target → the contract, and the scale that must agree with it (within 15%). */
const CONTRACTS: Record<string, { contract: Contract; scale?: number }> = {
  "giza/stones": { contract: { standingHeight: 0.15, visibleFraction: 0.41, supportPoint: px(1900, 1660), comparators: "the boy in yellow at the left of the block and the boy in blue seated at its right" } },
  "giza/stall": { contract: { standingHeight: 0.185, visibleFraction: 0.75, supportPoint: px(725, 1420), comparators: "the vendor's child behind the counter and the boy in red crouching at the right of the stall" }, scale: 0.185 },
  "paris/bakery": { contract: { standingHeight: 0.17, visibleFraction: 0.4, supportPoint: px(2750, 1880), comparators: "the girl in the straw hat at the counter and the boy in blue at the basket" } },
  "paris/carousel": { contract: { standingHeight: 0.147, visibleFraction: 0.85, supportPoint: { x: 0.6071, y: 0.5371 }, comparators: "the boy riding the white horse and the children at the carousel's edge" }, scale: 0.147 },
  "paris/awning": { contract: { standingHeight: 0.185, visibleFraction: 0.25, supportPoint: px(880, 1880), comparators: "the girl in the blue dress and the boy in orange beside the easel" } },
  "antarctica/sledge": { contract: { standingHeight: 0.17, visibleFraction: 0.8, supportPoint: px(1900, 1880), comparators: "the boy in the green jacket seated on the sledge and the boy in red standing beside it" } },
  "sydney/lifeguard": { contract: { standingHeight: 0.093, visibleFraction: 0.62, supportPoint: px(855, 935), comparators: "the boy sitting on the sand at the left of the chair and the lifeguard seated on it" } },
};

/** The new Sydney target, in the ferry's place (difficulty 1). */
const LIFEGUARD: Target = {
  id: "lifeguard",
  targetType: "sydney_lifeguard",
  bodyTemplate: "sydney_lifeguard",
  difficulty: 1,
  mission: { en: "Find {name} under the lifeguard chair", he: "מצאו את {name} מתחת לכיסא המציל" },
  item: { en: "a tall white lifeguard chair with a red and yellow umbrella", he: "כיסא מציל לבן וגבוה עם שמשייה אדומה וצהובה" },
  success: [
    { en: "The lifeguard did not see me!", he: "המציל לא ראה אותי!" },
    { en: "You found me! It is shady down here.", he: "מצאתם! יש פה צל נעים." },
    { en: "I can see the whole beach from here.", he: "רואים מפה את כל החוף." },
  ],
  animation: "peek",
  action: "The child is crouching under the lifeguard chair between its front legs, one hand holding a leg, peeking out at the beach.",
  expression: "mischievous and delighted, eyes wide, mid-giggle, as if about to be spotted",
  slots: [
    {
      id: "sydney_lifeguard_a",
      x: px(855, 0).x, y: r4((935 - 0.62 * 0.093 * 2048 / 2) / 2048), scale: 0.093,
      hintZone: { x: px(855, 0).x, y: r4((935 - 0.62 * 0.093 * 2048 / 2) / 2048 - 0.015), r: 0.075 },
      hintText: { en: "Look between the legs of the tall white chair.", he: "חפשו בין הרגליים של הכיסא הלבן הגבוה." },
      layer: "front",
      placement: {
        pose: "crouching",
        support: "Crouching on the sand between the front legs of the lifeguard chair, under its platform; both feet on the sand.",
        occlusion: "The chair's white legs and cross-braces may overlap her where they cross; nothing else is in front of her, and the platform above her head stays where it is.",
        instructions: "Crouch under the lifeguard chair between its front legs, one hand holding a leg, facing the viewer with the whole face showing between the braces. Keep the chair, its legs, braces and platform exactly as they are; the child is small enough to fit under the platform.",
      },
    },
    {
      id: "sydney_lifeguard_b",
      x: 0.29, y: 0.28, scale: 0.08,
      hintZone: { x: 0.29, y: 0.265, r: 0.075 },
      hintText: { en: "Look up by the umbrella.", he: "חפשו למעלה ליד השמשייה." },
      layer: "front",
    },
  ],
};

function load(slug: string): { file: string; scene: Scene } {
  const file = path.join(ROOT, "content", "scenes", slug, "scene.json");
  return { file, scene: JSON.parse(readFileSync(file, "utf8")) as Scene };
}

function main() {
  const changed = new Map<string, { file: string; scene: Scene; before: Scene }>();
  const touch = (slug: string) => {
    if (!changed.has(slug)) {
      const { file, scene } = load(slug);
      changed.set(slug, { file, scene, before: JSON.parse(JSON.stringify(scene)) as Scene });
    }
    return changed.get(slug)!.scene;
  };

  // Sydney: the lifeguard replaces the ferry; no slot is behind the foreground any more, so the layer goes.
  const sydney = touch("sydney");
  const ferryIndex = sydney.targets.findIndex((t) => t.id === "ferry");
  if (ferryIndex < 0) throw new Error("sydney/ferry is not in the scene; already installed?");
  sydney.targets[ferryIndex] = LIFEGUARD;
  if (sydney.targets.some((t) => t.slots.some((s) => s.layer === "behindForeground"))) throw new Error("sydney still has a layer-mode slot");
  delete sydney.art.foreground;
  console.log(`sydney: ferry → lifeguard at ${LIFEGUARD.slots[0].x},${LIFEGUARD.slots[0].y} scale ${LIFEGUARD.slots[0].scale}; foreground layer dropped`);

  // Paris: the awning target's copy follows the easel hide (the slot itself was written by author-hides).
  const paris = touch("paris");
  const awning = paris.targets.find((t) => t.id === "awning");
  if (!awning) throw new Error("paris/awning missing");
  if (awning.slots[0].layer !== "behindForeground") throw new Error("paris/awning is not behind the foreground yet: run scripts/author-hides.ts --write --tag=20260908 first");
  awning.item = { en: "a painter's easel by the café tables", he: "כן ציור ליד שולחנות בית הקפה" };
  awning.slots[0].hintText = { en: "Look behind the painter's easel by the café tables.", he: "חפשו מאחורי כן הציור ליד שולחנות בית הקפה." };
  awning.action = "The child stands behind the painter's easel by the café, complete and upright, her head showing above the canvas and her legs between the easel's legs.";
  awning.expression = "mischievous and delighted, eyes wide, mid-giggle, as if about to be spotted";
  console.log("paris/awning: copy follows the easel hide");

  // The contracts.
  for (const [key, spec] of Object.entries(CONTRACTS)) {
    const [slug, targetId] = key.split("/") as [string, string];
    const scene = touch(slug);
    const target = scene.targets.find((t) => t.id === targetId);
    if (!target) throw new Error(`${key}: no such target`);
    const slot = target.slots[0];
    if (!slot.placement) throw new Error(`${key}: the slot has no placement recipe to hang a contract on`);
    if (spec.scale !== undefined) slot.scale = spec.scale;
    const off = Math.abs(spec.contract.standingHeight - slot.scale) / spec.contract.standingHeight;
    if (off > 0.15) throw new Error(`${key}: scale ${slot.scale} disagrees with standing height ${spec.contract.standingHeight}`);
    slot.placement.contract = spec.contract;
    console.log(`${key}: contract standing ${spec.contract.standingHeight} (${Math.round(spec.contract.standingHeight * scene.art.height)} px), shows ${spec.contract.visibleFraction}, support ${spec.contract.supportPoint.x},${spec.contract.supportPoint.y}; scale ${slot.scale}`);
  }

  // Archive and bump.
  const archive: Scene[] = existsSync(ARCHIVE) ? (JSON.parse(readFileSync(ARCHIVE, "utf8")) as Scene[]) : [];
  for (const [slug, { scene, before }] of changed) {
    if (!archive.some((s) => s.slug === slug && s.version === before.version)) archive.push(before);
    scene.version = before.version + 1;
    console.log(`${slug}: version ${before.version} → ${scene.version}`);
  }
  if (!WRITE) { console.log("dry run; pass --write to install"); return; }
  writeFileSync(ARCHIVE, JSON.stringify(archive, null, 2) + "\n");
  for (const { file, scene } of changed.values()) writeFileSync(file, JSON.stringify(scene, null, 2) + "\n");
  console.log(`archived ${archive.length} scene versions to ${path.relative(ROOT, ARCHIVE)}; now register it in content/scenes/index.ts and run npm run scenes:validate`);
}
main();
