/** Offline display derivative of the already-public demo. No customer pixels, provider or game mutation.
 * npx tsx scripts/prepare-transformation-preview.ts --apply
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { buildDemoConfig } from "../src/services/demo";
import { scenePreview } from "../src/game/engine/scene-preview";
import { targetGeometry } from "../src/game/engine/target-geometry";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function main() {
  const scene = buildDemoConfig("en", "beach").scenes[0]!;
  const target = scene.targets.find(t => t.id === "sandcastle")!;
  const preview = scenePreview(scene, target)!;
  const geometry = targetGeometry(scene, target, "A"), sprite = geometry.sprite;
  if (scene.art.base !== "/scenes/demo-beach-v1/base.webp" || scene.art.foreground || sprite.kind !== "image" || !sprite.rect || !/^\/demo\/beach-v1\/[a-f0-9]{64}\.webp$/.test(sprite.url)) throw Error("Only the approved public beach demo may be prepared");
  const board = readFileSync(`public${scene.art.base}`), patch = readFileSync(`public${sprite.url}`);
  const rect = { left: Math.round(sprite.rect.x * scene.art.width), top: Math.round(sprite.rect.y * scene.art.height), width: Math.round(sprite.rect.w * scene.art.width), height: Math.round(sprite.rect.h * scene.art.height) };
  const height = Math.round(preview.frame.height / 5) * 5, width = height * 4 / 5;
  const crop = { left: Math.max(0, Math.min(scene.art.width - width, Math.round(preview.frame.x))), top: Math.max(0, Math.min(scene.art.height - height, Math.round(preview.frame.y))), width, height };
  const layer = await sharp(patch).resize(rect.width, rect.height, { fit: "fill" }).png().toBuffer();
  const composed = await sharp(board).composite([{ input: layer, left: rect.left, top: rect.top }]).png().toBuffer();
  const bytes = await sharp(composed).extract(crop).resize(720, 900).webp({ quality: 80, effort: 6 }).toBuffer();
  const sha256 = hash(bytes), src = `/home/transform-found-${sha256}.webp`;
  const manifest = { src, sha256, bytes: bytes.length, width: 720, height: 900, crop,
    bubble: { x: (geometry.head.x * scene.art.width - crop.left) / crop.width, y: (geometry.head.y * scene.art.height - crop.top) / crop.height },
    source: { board: scene.art.base, boardSha256: hash(board), patch: sprite.url, patchSha256: hash(patch), sceneVersion: scene.version, target: target.id, variant: "A", rect } };
  if (process.argv.includes("--apply")) {
    mkdirSync("public/home", { recursive: true });
    writeFileSync(`public${src}`, bytes);
    writeFileSync("content/home/transformation-preview.json", JSON.stringify(manifest, null, 2) + "\n");
  }
  console.log(JSON.stringify({ applied: process.argv.includes("--apply"), bytes: bytes.length, masterBytes: board.length, src }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
