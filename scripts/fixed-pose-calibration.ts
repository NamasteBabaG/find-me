/** Free validation/visualization of source-blind board measurements. Never authorizes placement. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
const ROOT = path.resolve("work/fixed-sprite-pilot-20260908/standing-v1/board-calibration-v1");
const STAGE = path.resolve("work/fixed-sprite-pilot-20260908/stages/original-board-metrics-v1");
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const point = z.object({ x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative() }).strict();
const observation = z.object({ point: point.nullable(), confidence: z.number().min(0).max(1), reason: z.string().min(1) }).strict();
const comparator = z.object({ id: z.string().min(1), description: z.string().min(1), ageClass: z.enum(["child", "adult", "uncertain"]), sameDepthConfidence: z.number().min(0).max(1), posture: z.string(), uprightSuitable: z.boolean(), points: z.object({ eyeMidpoint: observation, chin: observation, leftSole: observation, rightSole: observation }).strict(), notes: z.string() }).strict();
const schema = z.object({ regions: z.array(z.object({ image: z.union([z.literal(2), z.literal(3)]), comparators: z.array(comparator).max(3), uncertainties: z.string() }).strict()).length(2), summary: z.string() }).strict();

async function main() {
  const receiptBytes = readFileSync(path.join(STAGE, "result.json"));
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  if (receipt.status !== "measured-not-approved" || receipt.costUnknown !== false || receipt.model !== "gpt-5.6-sol" || !receipt.requestId) throw new Error("Unverified measurement response");
  const parsed = schema.parse(receipt.measurement);
  if (new Set(parsed.regions.map(r => r.image)).size !== 2) throw new Error("Duplicate crop ID");
  mkdirSync(ROOT, { recursive: false });
  const rows = [];
  for (const region of parsed.regions) {
    const imageFile = path.join(STAGE, region.image === 2 ? "snow-ground.png" : "cargo.png");
    const bytes = readFileSync(imageFile), m = await sharp(bytes).metadata();
    const labels: string[] = [];
    const colors = ["#ff325f", "#00a2e9", "#a536ed"];
    if (new Set(region.comparators.map(c => c.id)).size !== region.comparators.length) throw new Error("Duplicate comparator ID");
    for (const [i, c] of region.comparators.entries()) {
      for (const p of Object.values(c.points)) if (p.point && (p.point.x > m.width! || p.point.y > m.height!)) throw new Error("Point outside its declared crop");
      const { eyeMidpoint: e, chin: ch, leftSole: l, rightSole: r } = c.points;
      if (!e.point || !ch.point || !l.point || !r.point) { rows.push({ id: c.id, eligible: false, reason: "Missing visible measurement" }); continue; }
      if (ch.point.y <= e.point.y || Math.min(l.point.y, r.point.y) <= ch.point.y) throw new Error("Reversed face/sole geometry");
      const s = { x: (l.point.x + r.point.x) / 2, y: (l.point.y + r.point.y) / 2 };
      const face = Math.hypot(ch.point.x - e.point.x, ch.point.y - e.point.y), body = Math.hypot(s.x - e.point.x, s.y - e.point.y);
      const eligible = c.ageClass === "child" && c.uprightSuitable && c.sameDepthConfidence >= .85 && Object.values(c.points).every(p => p.confidence >= .85);
      rows.push({ id: c.id, image: region.image, faceDistancePx: face, eyeToSolePx: body, bodyToFaceRatio: body / face, eligibleForAutomaticCalibration: eligible, minimumConfidence: Math.min(c.sameDepthConfidence, ...Object.values(c.points).map(p => p.confidence)), reason: eligible ? "Passes pilot confidence gate; still not a human label" : "Low-confidence comparator retained as diagnostic evidence only" });
      for (const [name, q] of [["E", e.point], ["C", ch.point], ["L", l.point], ["R", r.point]] as const) labels.push(`<circle cx="${q.x}" cy="${q.y}" r="3" fill="none" stroke="${colors[i]}" stroke-width="2"/><text x="${q.x + 4}" y="${q.y - 4}" font-size="11" fill="${colors[i]}" stroke="white" stroke-width="2" paint-order="stroke">${i + 1}${name}</text>`);
    }
    writeFileSync(path.join(ROOT, `image-${region.image}-measurements.png`), await sharp(bytes).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="${m.height}">${labels.join("")}</svg>`) }]).png().toBuffer(), { flag: "wx" });
  }
  const result = { receiptSha256: sha(receiptBytes), requestId: receipt.requestId, costCents: receipt.costCents, rows, automaticCalibration: false, decision: "No comparator clears every0.85confidence gate; no production contract is automatically revised. Diagnostic ratios can guide the next hypothesis, not certify a spot." };
  writeFileSync(path.join(ROOT, "measurements.json"), JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(JSON.stringify(result));
}
main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
