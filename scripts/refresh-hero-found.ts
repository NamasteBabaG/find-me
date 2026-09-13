/** The hero's board: the demo child the live demo shows (the beach sandcastle
 * patch) painted into the beach at the exact rect the game draws it, cut two
 * ways — a wide crop for the tablet, the laptop and the phone-sized card, and
 * a tall 9:16 crop for the phone — with the child's head recorded per crop, so
 * the hero can put its ring and its bubble on her without a coordinate living
 * in a component. Marketing copies only; no paid calls, no uploads.
 * npx tsx scripts/refresh-hero-found.ts --apply
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { buildDemoConfig } from "../src/services/demo";
import { targetGeometry } from "../src/game/engine/target-geometry";

const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const round = (n: number) => Math.round(n * 10000) / 10000;
const SLUG = "beach";
const TARGET = "sandcastle";
const VARIANT = "A";
// Wide: the child sits left of centre, the headline takes the other side (RTL
// puts the copy on the right). Tall: 9:16 around her, her body at 62% down.
const WIDE = { x: 0.1, y: 0.33, w: 0.64, h: 0.58, width: 1400 };
const TALL = { h: 0.7, childY: 0.62, width: 720 };

async function main() {
  const apply = process.argv.includes("--apply");
  // The live demo owns both the current identity and its effective foreground.
  // Historical public/demo/patches files are evidence, not the playable set.
  const demo = buildDemoConfig("en", SLUG);
  const scene = demo.scenes[0]!;
  const target = scene.targets.find((item) => item.id === TARGET);
  if (!target) throw new Error(`The demo has no ${TARGET} target`);
  const geometry = targetGeometry(scene, target, VARIANT);
  const patch = geometry.sprite;
  if (patch.kind !== "image" || !patch.rect) throw new Error(`The ${TARGET} demo target must have an image patch`);
  const W = scene.art.width;
  const H = scene.art.height;
  const rect = { x: Math.round(patch.rect.x * W), y: Math.round(patch.rect.y * H), w: Math.round(patch.rect.w * W), h: Math.round(patch.rect.h * H) };
  const base = readFileSync(path.join("public", scene.art.base));
  const sprite = readFileSync(path.join("public", patch.url));
  const patchLayer: OverlayOptions = { input: await sharp(sprite).resize({ width: rect.w, height: rect.h, fit: "fill" }).png().toBuffer(), left: rect.x, top: rect.y };
  const foreground = scene.art.foreground ? readFileSync(path.join("public", scene.art.foreground)) : null;
  const layers: OverlayOptions[] = [];
  if (geometry.slot.layer === "behindForeground") layers.push(patchLayer);
  if (foreground) layers.push({ input: await sharp(foreground).png().toBuffer(), left: 0, top: 0 });
  if (geometry.slot.layer !== "behindForeground") layers.push(patchLayer);
  const board = await sharp(base).composite(layers).png().toBuffer();

  const anchor = { x: geometry.head.x * W, y: geometry.head.y * H };
  const centre = { x: geometry.center.x * W, y: geometry.center.y * H };
  const wide = { left: Math.round(WIDE.x * W), top: Math.round(WIDE.y * H), width: Math.round(WIDE.w * W), height: Math.round(WIDE.h * H) };
  const tallH = Math.round(TALL.h * H);
  const tallW = Math.round((tallH * 9) / 16);
  const tall = { left: Math.round(centre.x - tallW / 2), top: Math.round(centre.y - TALL.childY * tallH), width: tallW, height: tallH };

  const crops: Record<string, unknown> = {};
  for (const [name, box, width] of [["wide", wide, WIDE.width], ["phone", tall, TALL.width]] as const) {
    if (box.left < 0 || box.top < 0 || box.left + box.width > W || box.top + box.height > H) throw new Error(`The ${name} crop leaves the board`);
    const bytes = await sharp(board).extract(box).resize({ width }).webp({ quality: 66, effort: 6 }).toBuffer();
    const meta = await sharp(bytes).metadata();
    const assetPath = `/home/hero-found-${name}.webp`;
    const assetSha256 = hash(bytes);
    crops[name] = {
      src: `${assetPath}?v=${assetSha256.slice(0, 16)}`,
      assetPath,
      assetSha256,
      bytes: bytes.length,
      width: meta.width,
      height: meta.height,
      sourceRect: box,
      // Normalised inside the crop: the top of the head (the patch anchor) and the middle of the child.
      head: { x: round((anchor.x - box.left) / box.width), y: round((anchor.y - box.top) / box.height) },
      child: { x: round((centre.x - box.left) / box.width), y: round((centre.y - box.top) / box.height) },
    };
    if (apply) {
      mkdirSync("public/home", { recursive: true });
      writeFileSync(path.join("public", assetPath), bytes);
    }
  }
  const manifest = {
    scene: SLUG,
    sceneVersion: scene.version,
    target: TARGET,
    variant: VARIANT,
    board: scene.art.base,
    boardSha256: hash(base),
    foreground: scene.art.foreground ?? null,
    foregroundSha256: foreground ? hash(foreground) : null,
    patch: patch.url,
    patchSha256: hash(sprite),
    rect,
    layer: geometry.slot.layer,
    anchorNorm: geometry.head,
    centerNorm: geometry.center,
    face: demo.child.avatarUrl,
    faceSha256: hash(readFileSync(path.join("public", demo.child.avatarUrl))),
    crops,
  };
  if (apply) {
    mkdirSync("content/home", { recursive: true });
    writeFileSync("content/home/hero-found.json", JSON.stringify(manifest, null, 2) + "\n");
  }
  console.log(JSON.stringify({ applied: apply, ...manifest }));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
