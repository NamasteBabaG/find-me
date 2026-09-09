/** Original-board authoring only: deterministic crops, grids and exact-pixel foregrounds. No API or games. */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { fixedSlotV3ContractSchema, pointInPolygon, sha256Bytes, sha256Rgba } from "../src/services/generation/fixed-sprite";

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const coordinate = z.tuple([z.number().finite().nonnegative(), z.number().finite().nonnegative()]);
const rectangle = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().positive(), z.number().int().positive()]);
const planSchema = z.object({
  board: z.string().regex(/^[a-z]+$/), revision: z.string().regex(/^[a-z0-9-]+$/), boardSha256: z.string().regex(/^[a-f0-9]{64}$/),
  authoringNote: z.string().min(1),
  slots: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/), eye: coordinate, face: z.tuple([z.number().positive(), z.number().nonnegative()]),
    body: z.tuple([z.number().positive(), z.number().positive()]), envelope: rectangle, window: rectangle,
    foregroundPolygons: z.array(z.array(coordinate).min(3)).min(1),
    forbidden: z.array(z.object({ id: z.string().min(1), rect: rectangle, scope: z.enum(["unoccluded", "final-visible"]).optional() })),
    recipe: z.object({ support: z.string().min(1), occlusion: z.string().min(1), comparators: z.string().min(1) }),
  })).min(1).max(3),
});

async function main() {
  const command = process.argv[2];
  const outArg = arg("out");
  if (!outArg) throw new Error("Explicit fresh --out is required");
  const out = path.resolve(outArg);
  const work = path.resolve("work");
  if (!out.startsWith(`${work}${path.sep}`) || existsSync(out)) throw new Error("Use a fresh directory strictly inside work; no historical overwrite");
  const planFile = arg("plan");
  const planBytes = planFile ? readFileSync(planFile) : undefined;
  const plan = planBytes ? planSchema.parse(JSON.parse(planBytes.toString("utf8"))) : undefined;
  const slug = plan?.board ?? arg("board");
  if (!slug || !/^[a-z]+$/.test(slug) || !["inspect", "freeze"].includes(command ?? "")) throw new Error("Use inspect --board or freeze --plan");
  if (command === "freeze" && !plan) throw new Error("freeze requires --plan");
  const scene = JSON.parse(readFileSync(`content/scenes/${slug}/scene.json`, "utf8"));
  const boardFile = path.resolve("public", scene.art.base.replace(/^\//, ""));
  if (!boardFile.startsWith(`${path.resolve("public/scenes")}${path.sep}`)) throw new Error("Board path must stay in public/scenes");
  const bytes = readFileSync(boardFile), hash = sha256Bytes(bytes);
  if (hash !== scene.art.sha256 || (plan && hash !== plan.boardSha256)) throw new Error("Original board hash changed");
  const raw = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = raw.info;
  const p = (x: number, y: number) => ({ x: x / width, y: y / height });
  const rectanglePolygon = ([x, y, w, h]: [number, number, number, number]) => [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)];
  const rectObject = (r: [number, number, number, number]) => {
    if (r[0] + r[2] > width || r[1] + r[3] > height) throw new Error("Crop/rectangle leaves original board");
    return { left: r[0], top: r[1], width: r[2], height: r[3] };
  };
  mkdirSync(out, { recursive: true });
  const write = (name: string, value: Buffer | string) => writeFileSync(path.join(out, name), value, { flag: "wx" });
  const json = (name: string, value: unknown) => write(name, JSON.stringify(value, null, 2));
  const svg = (w: number, h: number, contents: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${contents}</svg>`);
  if (command === "inspect") {
    const values = (arg("rect") ?? `0,0,${width},${height}`).split(",").map(Number);
    const window = rectObject(rectangle.parse(values));
    const crop = await sharp(bytes).extract(window).png().toBuffer();
    const grid: string[] = [];
    for (let x = Math.ceil(window.left / 50) * 50; x < window.left + window.width; x += 50) grid.push(`<path d="M${x - window.left} 0V${window.height}"/><text x="${x - window.left + 2}" y="14">${x}</text>`);
    for (let y = Math.ceil(window.top / 50) * 50; y < window.top + window.height; y += 50) grid.push(`<path d="M0 ${y - window.top}H${window.width}"/><text x="2" y="${y - window.top - 2}">${y}</text>`);
    write("original.png", crop);
    write("grid.png", await sharp(crop).composite([{ input: svg(window.width, window.height, `<style>path{stroke:#00b7dc;stroke-opacity:.5}text{font:12px sans-serif;fill:#111;stroke:#fff;stroke-width:2;paint-order:stroke}</style>${grid.join("")}`) }]).png().toBuffer());
    json("inspection.json", { boardFile, boardSha256: hash, width, height, window, inputScope: "original board only", automaticRelease: false });
  } else if (plan) {
    if (new Set(plan.slots.map(s => s.id)).size !== plan.slots.length) throw new Error("Duplicate slots");
    const slots = [];
    for (const s of plan.slots) {
      const polygons = s.foregroundPolygons.map(poly => poly.map(([x, y]) => {
        if (x > width || y > height) throw new Error("Foreground polygon leaves board");
        return p(x, y);
      }));
      const foreground = Buffer.alloc(width * height * 4);
      const all = s.foregroundPolygons.flat();
      const left = Math.floor(Math.min(...all.map(a => a[0]))), right = Math.ceil(Math.max(...all.map(a => a[0])));
      const top = Math.floor(Math.min(...all.map(a => a[1]))), bottom = Math.ceil(Math.max(...all.map(a => a[1])));
      let originalPixels = 0;
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (polygons.some(poly => pointInPolygon(p(x + .5, y + .5), poly))) {
        const i = (y * width + x) * 4; foreground.set(raw.data.subarray(i, i + 4), i); originalPixels++;
      }
      if (!originalPixels) throw new Error("Empty foreground");
      rectObject(s.envelope);
      const window = rectObject(s.window);
      const foregroundFile = path.join(out, `${s.id}-foreground.png`);
      const contract = fixedSlotV3ContractSchema.parse({
        version: "fixed-sprite/v3", measurementVersion: "visible-face/v1", board: { sha256: hash, width, height }, poseId: "standing", slotId: `${slug}-${s.id}-${plan.revision}`,
        support: { type: "occluded-standing", sourceLandmark: "eyeMidpoint", destination: p(...s.eye), tolerancePx: 4 },
        scale: { kind: "landmark-distance", from: "eyeMidpoint", to: "chin", destinationDistancePx: s.face[0], tolerancePx: s.face[1] },
        bodyScale: { kind: "landmark-distance-interval", from: "eyeMidpoint", to: "soleMidpoint", minDistancePx: s.body[0], maxDistancePx: s.body[1] },
        requiredHiddenLandmarks: [{ sourceLandmark: "leftFoot", radiusPx: 2 }, { sourceLandmark: "rightFoot", radiusPx: 2 }],
        anchorChecks: [], allowedEnvelope: rectanglePolygon(s.envelope), forbiddenRegions: s.forbidden.map(f => ({ id: f.id, polygon: rectanglePolygon(f.rect), ...(f.scope ? { scope: f.scope } : {}) })),
        foregroundMask: { rgbaSha256: sha256Rgba(foreground, width, height), width, height, mode: "board-foreground-alpha" },
      });
      write(`${s.id}-foreground.png`, await sharp(foreground, { raw: { width, height, channels: 4 } }).png().toBuffer());
      const crop = await sharp(bytes).extract(window).png().toBuffer();
      write(`${s.id}-original.png`, crop);
      const outline = s.foregroundPolygons.map(poly => `<polygon points="${poly.map(([x, y]) => `${x-window.left},${y-window.top}`).join(" ")}" fill="#ee258d" fill-opacity=".3" stroke="#ee258d"/>`).join("");
      write(`${s.id}-review.png`, await sharp(crop).composite([{ input: svg(window.width, window.height, `${outline}<circle cx="${s.eye[0]-window.left}" cy="${s.eye[1]-window.top}" r="5" fill="#00d9ff"/>`) }]).png().toBuffer());
      slots.push({ id: s.id, contract, foregroundFile, window, annotation: plan.authoringNote, judgeRecipe: { pose: "standing", ...s.recipe, occlusionMode: "layer" }, originalForegroundPixels: originalPixels });
    }
    write("plan.json", planBytes!);
    json("slots.json", { version: 2, boardFile, boardSha256: hash, status: "authored-candidates-not-approved", automaticRelease: false, createdAt: new Date().toISOString(), planSha256: sha256Bytes(planBytes!), authoringNote: plan.authoringNote, slots });
  }
  console.log(JSON.stringify({ out, board: slug, boardSha256: hash, paidCalls: 0, automaticRelease: false }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
