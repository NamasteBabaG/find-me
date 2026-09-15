/** Deterministic preparation/composition for a bundled imagegen CLI local edit.
 * This does not call any provider or modify the shared board / other hides. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const dir = "storage/public-demo-beach-20260915-v2";
const source = `${dir}/beach-library.png`;
const sourceHash = "39037038dd2a641243cd920d1b997b162e755e3f3949c835cd65fe471a05e183";
const roi = { left: 152, top: 600, width: 108, height: 115 };
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function main() {
  const original = readFileSync(source);
  if (hash(original) !== sourceHash) throw new Error("Approved source changed");
  const phase = process.argv[2];
  mkdirSync("output/imagegen", { recursive: true });
  if (phase === "--prepare") {
    const mask = Buffer.alloc(512 * 768 * 4, 255);
    for (let y = roi.top; y < roi.top + roi.height; y++) {
      for (let x = roi.left; x < roi.left + roi.width; x++) mask[(y * 512 + x) * 4 + 3] = 0;
    }
    await sharp(mask, { raw: { width: 512, height: 768, channels: 4 } }).png().toFile("output/imagegen/beach-foot-mask.png");
    await sharp("public/scenes/demo-beach-v1/base.webp").extract({ left: 3040, top: 300, width: 512, height: 768 }).png().toFile("output/imagegen/beach-foot-original-reference.png");
    console.log({ prepared: true, sourceHash, roi, paidCalls: 0 });
    return;
  }
  if (phase !== "--compose") throw new Error("Choose --prepare or --compose");
  const generated = readFileSync("output/imagegen/beach-foot-repair-generated.png");
  const rgb = await sharp(generated).resize(512, 768).removeAlpha().raw().toBuffer();
  const before = await sharp(original).removeAlpha().raw().toBuffer();
  const after = Buffer.from(before);
  for (let y = roi.top; y < roi.top + roi.height; y++) {
    for (let x = roi.left; x < roi.left + roi.width; x++) {
      const alpha = Math.min(1, (x - roi.left) / 5, (roi.left + roi.width - 1 - x) / 5, (y - roi.top) / 5, (roi.top + roi.height - 1 - y) / 5);
      for (let c = 0; c < 3; c++) {
        const i = (y * 512 + x) * 3 + c;
        after[i] = Math.round(before[i]! * (1 - alpha) + rgb[i]! * alpha);
      }
    }
  }
  let changedOutside = 0;
  for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
    if (x >= roi.left && x < roi.left + roi.width && y >= roi.top && y < roi.top + roi.height) continue;
    for (let c = 0; c < 3; c++) if (before[(y * 512 + x) * 3 + c] !== after[(y * 512 + x) * 3 + c]) changedOutside++;
  }
  if (changedOutside) throw new Error("Protected pixels changed");
  const output = await sharp(after, { raw: { width: 512, height: 768, channels: 3 } }).png().toBuffer();
  writeFileSync(`${dir}/beach-library-occlusion.png`, output);
  const evidence = { sourceSha256: sourceHash, generatedSha256: hash(generated), sha256: hash(output), roi, changedOutside, visualReview: "pending", mode: "bundled-imagegen-cli-masked-edit" };
  writeFileSync(`${dir}/beach-library-occlusion.json`, JSON.stringify(evidence, null, 2) + "\n");
  await sharp(output).extract({ left: 110, top: 515, width: 205, height: 220 }).resize(820, 880).png().toFile("output/imagegen/beach-foot-repair-review.png");
  console.log(evidence);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
