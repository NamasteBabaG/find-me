/** Read-only evidence: never rewrites observed landmarks or accepts a composite. */
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { resolveStandingPixel } from "../src/services/generation/standing-pixels";
import { writeImmutableBytes } from "./board-conditioned-probe-replay";
type Point = { x: number; y: number };
async function main() {
  const flag = (key: string) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3);
  const resultPath = flag("result");
  if (!resultPath) throw new Error("--result=<free-reposition result.json> required");
  const result = JSON.parse(readFileSync(resultPath, "utf8")), evidence = [];
  for (const [i, appearance] of result.appearances.entries()) {
    const c = appearance.composite;
    if (!c?.source.standing || c.slot.mode !== "open") continue;
    const { data, info } = await sharp(path.join(path.dirname(resultPath), `sprite-${i + 1}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const raw = c.source.standing, standard = Object.fromEntries(["crown", "leftSole", "rightSole"].map(k => [k, resolveStandingPixel(raw[k], data, info.width, info.height)]));
    let nearest: Point | null = null, best = Infinity;
    for (let y = Math.floor(raw.crown.y) - 12; y <= Math.ceil(raw.crown.y) + 12; y++) for (let x = Math.floor(raw.crown.x) - 12; x <= Math.ceil(raw.crown.x) + 12; x++) {
      const distance = Math.hypot(x - raw.crown.x, y - raw.crown.y);
      if (distance > 12 || distance >= best || x < 0 || y < 0 || x >= info.width || y >= info.height || data[(y * info.width + x) * 4 + 3]! < 224) continue;
      best = distance; nearest = { x, y };
    }
    const transform = (points: typeof raw) => {
      const sole = { x: (points.leftSole.x + points.rightSole.x) / 2, y: Math.max(points.leftSole.y, points.rightSole.y) };
      const scale = c.slot.standingHeightPx / (sole.y - points.crown.y);
      return { scale, translateX: c.slot.supportPointPx.x - sole.x * scale, translateY: c.slot.supportPointPx.y - sole.y * scale };
    };
    const baseline = { crown: standard.crown ?? raw.crown, leftSole: standard.leftSole ?? raw.leftSole, rightSole: standard.rightSole ?? raw.rightSole };
    const from = transform(baseline), rawTransform = transform(raw), to = nearest ? transform({ ...baseline, crown: nearest }) : null;
    const corners = [[false, false], [true, false], [false, true], [true, true]];
    const affine = (t: typeof from, right: boolean, bottom: boolean) => ({ x: t.translateX + (right ? info.width * t.scale : 0), y: t.translateY + (bottom ? info.height * t.scale : 0) });
    const raster = (t: typeof from, right: boolean, bottom: boolean) => ({ x: Math.round(t.translateX) + (right ? Math.max(1, Math.round(info.width * t.scale)) : 0), y: Math.round(t.translateY) + (bottom ? Math.max(1, Math.round(info.height * t.scale)) : 0) });
    const delta = (a: typeof from, b: typeof from, fn: typeof affine) => Math.max(...corners.map(([right, bottom]) => { const p = fn(a, right!, bottom!), q = fn(b, right!, bottom!); return Math.hypot(p.x - q.x, p.y - q.y); }));
    evidence.push({ slot: i + 1, slotId: appearance.slotId, rawCrown: raw.crown, standardCrown: standard.crown, nearestOpaque224Within12: nearest,
      sourceDistance: nearest ? best : null, faceDistance: Math.hypot(raw.crown.x - c.source.eye.x, raw.crown.y - c.source.eye.y),
      alphaAtObservedCrown: data[(Math.floor(raw.crown.y) * info.width + Math.floor(raw.crown.x)) * 4 + 3],
      sourceSize: { width: info.width, height: info.height }, baseline: from, candidate: to,
      maxAffineBoardDisplacement: to ? delta(from, to, affine) : null, maxRasterBoardDisplacement: to ? delta(from, to, raster) : null,
      maxRawAffineBoardDisplacement: to ? delta(rawTransform, to, affine) : null, maxRawRasterBoardDisplacement: to ? delta(rawTransform, to, raster) : null,
      originalChecks: c.checks, approved: false, policyChanged: false });
  }
  const report = { resultPath, incrementalApiCalls: 0, originalObservationsChanged: false, note: "Diagnostic only. Nearest opaque pixels are not automatic anatomical approval.", evidence };
  if (flag("out")) { const out = path.resolve(flag("out")!); if (!out.startsWith(path.resolve("work") + path.sep)) throw new Error("private evidence must stay under work/"); mkdirSync(out, { recursive: true }); writeImmutableBytes(path.join(out, "crown-audit.json"), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify(report, null, 2));
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
