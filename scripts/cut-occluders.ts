/**
 * The object in front of a hiding spot, cut out of the board itself.
 *
 * A peek used to be asked of the painter: "show only what is above the
 * barrel". The painter fails that most of the time (7 September: the bench
 * came back raised, heads came back alone and flat), and the judge rejects
 * what it manages. So the hide is no longer painted: the child is painted
 * whole, in the open, the way the spots that always worked are, and the
 * object is put back IN FRONT of her from the board's own pixels — the
 * scene's foreground layer, which the game and the judge already draw over
 * slots marked `behindForeground`. The cut-out is made once per board and
 * serves every child.
 *
 * OUTCOME (7 September, 18 cents): this does not work. Asked to keep one
 * object and key the rest, gpt-image-2 re-composes the object as a sticker
 * in the middle of the frame — with both wordings tried (work/occluders/r1,
 * r2) — exactly as the transparent-background mode did with the child. The
 * hides are authored by hand instead (scripts/author-hides.ts): the polygon
 * is traced on the board and the pixels are the board's own. Kept as the
 * record of the attempt; do not spend on it again without a new idea.
 *
 * How the pixels were to be chosen: gpt-image-2 is shown the window around the
 * occluder polygon and asked to keep only that object on magenta (the same
 * key as pass two); the alpha it answers with is clipped to the polygon
 * grown by a margin, and the colour comes from the board, never from the
 * model. Review the sheet before installing.
 *
 *   npx tsx scripts/cut-occluders.ts --budget-cents=60              # cut (paid) into work/occluders/<run>
 *   npx tsx scripts/cut-occluders.ts --install=work/occluders/<run>  # write foreground layers + slots (free)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { OpenAiAvatarProvider, fitMatte } from "../src/infra/generation/openai";
import { IMAGE_EDIT_RESERVE_CENTS } from "../src/infra/generation/image-edit-reserve";
import { keepMainBlobs } from "../src/services/generation/patch";
import { envKey } from "./slot-patch";

const ROOT = process.cwd();
const flag = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const PLAN = path.join(ROOT, "output", "journey-fixed-plans-20260907");
const WORLD = ["newyork", "amazon", "paris", "marrakech", "giza", "tokyo", "greatwall", "sydney", "antarctica"];

interface Point { x: number; y: number }
interface Placement { pose: string; support: string; occlusion: string; instructions: string; foreground?: Point[] }
interface Scene { slug: string; version: number; art: { width: number; height: number; base: string; foreground?: string; sha256?: string }; targets: Array<{ id: string; slots: Array<{ id: string; x: number; y: number; scale: number; layer: string; hintZone: { x: number; y: number; r: number }; placement?: Placement }> }> }

/** A square window around the polygon with room around it, aligned to 8 px. */
function windowFor(poly: Point[], art: { width: number; height: number }) {
  const xs = poly.map((p) => p.x * art.width), ys = poly.map((p) => p.y * art.height);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const size = Math.min(art.width, art.height, Math.max(512, Math.round(Math.max(x1 - x0, y1 - y0) * 2.2 / 8) * 8));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const x = Math.round(Math.min(Math.max(0, cx - size / 2), art.width - size));
  const y = Math.round(Math.min(Math.max(0, cy - size / 2), art.height - size));
  return { x, y, w: size, h: size };
}

function polygonSvg(poly: Point[], art: { width: number; height: number }, win: { x: number; y: number; w: number; h: number }, grow = 0) {
  const pts = poly.map((p) => `${(p.x * art.width - win.x).toFixed(1)},${(p.y * art.height - win.y).toFixed(1)}`).join(" ");
  const stroke = grow > 0 ? ` stroke="#fff" stroke-width="${grow * 2}" stroke-linejoin="round"` : "";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${win.w}" height="${win.h}"><rect width="100%" height="100%" fill="#000"/><polygon points="${pts}" fill="#fff"${stroke}/></svg>`);
}

/** The object, as the planning run described it, for the prompt. */
function objectOf(p: Placement): string {
  return p.occlusion.replace(/\s+hides?\b[\s\S]*$/i, "").replace(/^(The|the)\s+(original|visible|pictured|dense|near)\s+/, "").trim() || "the object in front of the child";
}

async function cut() {
  const key = envKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const budget = Number(flag("budget-cents", "0"));
  if (!(budget > 0)) throw new Error("Refusing to spend without --budget-cents=N");
  const out = path.join(ROOT, "work", "occluders", flag("run", new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")));
  mkdirSync(out, { recursive: true });
  const provider = new OpenAiAvatarProvider(key, { model: "gpt-image-2", quality: "low", patchQuality: "low", tries: 1, perMinute: 5 });
  const reserve = IMAGE_EDIT_RESERVE_CENTS.low;
  let spent = 0;
  const ledger: Array<Record<string, unknown>> = [];
  for (const slug of WORLD) {
    const scene = JSON.parse(readFileSync(path.join(ROOT, "content", "scenes", slug, "scene.json"), "utf8")) as Scene;
    const base = readFileSync(path.join(ROOT, "public", scene.art.base));
    for (const t of scene.targets) {
      const slot = t.slots[0]!;
      const poly = slot.placement?.foreground;
      if (!poly || poly.length < 3) continue;
      const name = `${slug}-${t.id}`;
      if (existsSync(path.join(out, `${name}.raw.png`))) continue;
      if (spent + reserve > budget) { console.warn(`stopping: ${spent.toFixed(2)} spent, ${reserve} reserved, ${budget} allowed`); break; }
      const win = windowFor(poly, scene.art);
      const crop = await sharp(base).extract({ left: win.x, top: win.y, width: win.w, height: win.h }).png().toBuffer();
      const where = await sharp(polygonSvg(poly, scene.art, win, 6)).png().toBuffer();
      const object = objectOf(slot.placement!);
      // The wording pass two keeps its framing with; a plainer "keep only the
      // bench" came back as a sticker of a bench in the middle of the frame.
      const prompt = [
        "Use case: isolating one object from an illustration by keying.",
        "EDIT IMAGE 1 ONLY. It is the exact scene; do not rebuild it from any other input image. This is background removal from IMAGE 1, not a new illustration.",
        `Image 2 is only a location guide: the white area marks ${object}. It is not an image to edit.`,
        `Return image 1 with exactly the same framing: ${object} stays at the identical position and size, with the same colours and linework. Do not zoom in, crop, move, resize, redraw, extend or complete it.`,
        "Paint every pixel that is not that object flat, uniform, pure magenta #FF00FF: the ground, the background, the sky, and every person, child and animal, even where they overlap it.",
        "No magenta, pink or purple tint on the object; no outline, glow, shadow or text on the magenta.",
      ].join(" ");
      const answer = await (provider as unknown as { call: (p: { images: Array<{ buffer: Buffer; name: string }>; prompt: string; size: string; label: string; quality: string; outputFormat: "png" }) => Promise<{ png: Buffer; costCents: number; costUnknown?: boolean; providerRequestId?: string; usage?: unknown; model: string }> }).call({
        images: [{ buffer: await sharp(crop).resize(1024, 1024, { kernel: "lanczos3" }).png().toBuffer(), name: "scene.png" }, { buffer: await sharp(where).resize(1024, 1024, { kernel: "nearest" }).png().toBuffer(), name: "where.png" }],
        prompt, size: "1024x1024", label: `${name}:occluder`, quality: "low", outputFormat: "png",
      });
      spent += answer.costUnknown ? reserve : answer.costCents;
      writeFileSync(path.join(out, `${name}.raw.png`), answer.png);
      writeFileSync(path.join(out, `${name}.crop.png`), crop);
      writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ slug, target: t.id, slotId: slot.id, window: win, object, prompt, costCents: answer.costCents, costUnknown: answer.costUnknown ?? false, requestId: answer.providerRequestId ?? null, usage: answer.usage ?? null, model: answer.model }, null, 2));
      ledger.push({ name, costCents: answer.costCents, requestId: answer.providerRequestId ?? null });
      await sheet(out, name, scene, slot, win, crop, answer.png);
      console.log(`${name}: ${answer.costCents.toFixed(2)}c · ${(spent / 100).toFixed(3)} USD so far`);
    }
  }
  writeFileSync(path.join(out, "ledger.json"), JSON.stringify({ budgetCents: budget, spentCents: spent, calls: ledger }, null, 2));
  console.log(`spent ${(spent / 100).toFixed(4)} USD; review ${out}/*.sheet.png then --install=${path.relative(ROOT, out)}`);
}

/** The keyed alpha, clipped to the grown polygon and cleaned, at the window's size; colour from the board. */
async function cutout(scene: Scene, slot: Scene["targets"][number]["slots"][number], win: { x: number; y: number; w: number; h: number }, crop: Buffer, raw: Buffer): Promise<{ rgba: Buffer; kept: number }> {
  const keyed = await fitMatte(raw, win.w, win.h);
  const alpha = await sharp(keyed).extractChannel(3).raw().toBuffer();
  const clip = await sharp(polygonSvg(slot.placement!.foreground!, scene.art, win, Math.round(win.w * 0.04))).extractChannel(0).raw().toBuffer();
  const hard = Buffer.alloc(win.w * win.h);
  for (let i = 0; i < hard.length; i++) hard[i] = alpha[i]! >= 128 && clip[i]! >= 128 ? 255 : 0;
  const blobs = keepMainBlobs(hard, win.w, win.h, 0.1);
  const board = await sharp(crop).removeAlpha().raw().toBuffer();
  const rgba = Buffer.alloc(win.w * win.h * 4);
  let kept = 0;
  for (let i = 0; i < win.w * win.h; i++) {
    const a = blobs.out[i] ? alpha[i]! : 0;
    rgba[i * 4] = board[i * 3]!; rgba[i * 4 + 1] = board[i * 3 + 1]!; rgba[i * 4 + 2] = board[i * 3 + 2]!; rgba[i * 4 + 3] = a;
    if (a >= 128) kept++;
  }
  return { rgba: await sharp(rgba, { raw: { width: win.w, height: win.h, channels: 4 } }).png().toBuffer(), kept };
}

/** Review sheet: the window | the model's answer | the cut-out on grey | the cut-out back on the board with a magenta test child behind it. */
async function sheet(out: string, name: string, scene: Scene, slot: Scene["targets"][number]["slots"][number], win: { x: number; y: number; w: number; h: number }, crop: Buffer, raw: Buffer) {
  const { rgba, kept } = await cutout(scene, slot, win, crop, raw);
  const T = 420;
  const tile = async (b: Buffer) => sharp(b).resize(T, T, { fit: "contain", background: "#202020" }).png().toBuffer();
  const onGrey = await sharp(rgba).flatten({ background: "#808080" }).png().toBuffer();
  const test = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${win.w}" height="${win.h}"><rect width="100%" height="100%" fill="none"/><ellipse cx="${win.w / 2}" cy="${win.h / 2}" rx="${win.w * 0.12}" ry="${win.h * 0.25}" fill="#ff00ff" fill-opacity="0.85"/></svg>`);
  const behind = await sharp(crop).composite([{ input: test, left: 0, top: 0 }, { input: rgba, left: 0, top: 0 }]).png().toBuffer();
  const row = await sharp({ create: { width: T * 4 + 24, height: T, channels: 3, background: "#202020" } })
    .composite([{ input: await tile(crop), left: 0, top: 0 }, { input: await tile(raw), left: T + 8, top: 0 }, { input: await tile(onGrey), left: 2 * (T + 8), top: 0 }, { input: await tile(behind), left: 3 * (T + 8), top: 0 }])
    .png().toBuffer();
  writeFileSync(path.join(out, `${name}.sheet.png`), row);
  writeFileSync(path.join(out, `${name}.cutout.png`), rgba);
  console.log(`  ${name}: cut-out keeps ${kept} px (window ${win.w}²)`);
}

async function install(run: string) {
  const dir = path.resolve(ROOT, run);
  const plans = new Map<string, { footX: number; footY: number; bodyHeight: number; pose: string; occlusion: string }>();
  for (const slug of WORLD) {
    const r = JSON.parse(readFileSync(path.join(PLAN, "calls", slug, "result.json"), "utf8")) as { placements: Array<{ targetId: string; footX: number; footY: number; bodyHeight: number; pose: string; occlusion: string }> };
    for (const p of r.placements) plans.set(`${slug}/${p.targetId}`, p);
  }
  const skip = new Set(flag("skip", "").split(",").filter(Boolean));
  for (const slug of WORLD) {
    const scenePath = path.join(ROOT, "content", "scenes", slug, "scene.json");
    const scene = JSON.parse(readFileSync(scenePath, "utf8")) as Scene;
    const artDir = path.dirname(scene.art.base);
    const fgRel = `${artDir}/foreground.webp`;
    const fgPath = path.join(ROOT, "public", fgRel);
    let layer = existsSync(fgPath)
      ? await sharp(readFileSync(fgPath)).ensureAlpha().png().toBuffer()
      : await sharp({ create: { width: scene.art.width, height: scene.art.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    let changed = 0;
    for (const t of scene.targets) {
      const name = `${slug}-${t.id}`;
      const meta = path.join(dir, `${name}.json`);
      if (!existsSync(meta) || skip.has(name)) continue;
      const m = JSON.parse(readFileSync(meta, "utf8")) as { window: { x: number; y: number; w: number; h: number } };
      const slot = t.slots[0]!;
      const { rgba } = await cutout(scene, slot, m.window, readFileSync(path.join(dir, `${name}.crop.png`)), readFileSync(path.join(dir, `${name}.raw.png`)));
      layer = await sharp(layer).composite([{ input: rgba, left: m.window.x, top: m.window.y }]).png().toBuffer();
      // The child is painted whole where her body is, and the object goes back in front of her.
      const plan = plans.get(`${slug}/${t.id}`)!;
      const p = slot.placement!;
      const pose = p.pose === "peeking" ? (/crouch/i.test(p.instructions) ? "crouching" : "standing") : p.pose;
      const object = objectOf(p);
      slot.layer = "behindForeground";
      slot.x = Math.round(plan.footX * 10000) / 10000;
      slot.y = Math.round((plan.footY - plan.bodyHeight / 2) * 10000) / 10000;
      slot.scale = Math.round(Math.min(0.25, Math.max(0.03, plan.bodyHeight)) * 10000) / 10000;
      slot.hintZone = { ...slot.hintZone, x: slot.x, y: Math.round(Math.max(0, slot.y - 0.015) * 10000) / 10000 };
      p.pose = pose as Placement["pose"];
      p.instructions = `Paint the child complete and unoccluded, ${pose} at this spot exactly as if ${object} were not there: the whole head, torso and arms, and the legs down to the feet on the ground behind it. ${object} is put back in front of the child afterwards from the board itself and hides what it hides; do not paint it over the child, and do not paint any part of the child as hidden.`;
      changed++;
      console.log(`${name}: behindForeground, body ${slot.scale} at ${slot.x},${slot.y}, pose ${pose}`);
    }
    if (changed === 0) continue;
    writeFileSync(fgPath, await sharp(layer).webp({ quality: 92, alphaQuality: 100 }).toBuffer());
    scene.art.foreground = fgRel;
    writeFileSync(scenePath, JSON.stringify(scene, null, 2) + "\n");
    console.log(`${slug}: ${changed} occluder(s) in ${fgRel}`);
  }
}

const installRun = flag("install", "");
(installRun ? install(installRun) : cut()).catch((err) => { console.error(err); process.exitCode = 1; });
