/**
 * The one question the sprite direction stands or falls on: can gpt-image-2
 * draw this child, in the boards' painting style, on a genuinely transparent
 * background — several poses in one image — with an alpha channel clean
 * enough to composite without a second paid call?
 *
 * If yes, pass two (a quarter of every attempt's cost, and the stage that
 * moved the child out of the canoe on all six attempts) disappears, and so
 * does layer mode's double-occlusion problem: a child drawn outside the board
 * has no occluder to paint around. If no, the direction is dead and we have
 * spent a few cents finding out.
 *
 * This buys ONE image per run and measures its alpha. It composites nothing
 * onto a board and judges nothing — those are the next step, and only if this
 * one passes.
 *
 *   npx tsx scripts/sprite-probe.ts --sheet=<private sheet.png> --name=<child> --age=8 \
 *     --board=sydney --out=work/sprite-probe --budget-dir=work/sprite-probe/budget \
 *     --limit-cents=500 [--quality=medium] [--poses=3] [--style]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { GenerationBudget } from "./generation-budget";

for (const line of readFileSync(path.resolve(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*(#.*)?$/.exec(line);
  if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = (m[2] ?? "").trim();
}
function flag(name: string, fallback = ""): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/**
 * What each cell of the probe sheet asks for. The poses are the three the
 * chosen board actually needs, so a sheet that works here is a sheet the
 * pipeline could use, not a demonstration.
 */
interface Cell { spot: string; pose: string; description: string }
const BOARDS: Record<string, { wardrobe: string; light: string; cells: Cell[] }> = {
  sydney: {
    wardrobe: "a plain yellow t-shirt and blue shorts, bare feet",
    light: "bright midday sun from the upper left, warm sand bounce, crisp short shadows",
    cells: [
      { spot: "surfboards", pose: "standing", description: "standing upright facing the viewer, arms relaxed at her sides, both feet flat on the ground, weight even" },
      { spot: "lifeguard", pose: "crouching", description: "crouching low on her heels facing the viewer, knees together, one hand held low beside her, head up and smiling" },
      { spot: "rocks", pose: "peeking", description: "kneeling low with her body turned to her left and her head raised and turned back towards the viewer, one hand raised beside her head" },
    ],
  },
  antarctica: {
    wardrobe: "a red padded winter coat with the hood down, blue snow trousers, mittens and snow boots",
    light: "flat bright overcast snow light, cool blue shadows, no harsh sun",
    cells: [
      { spot: "penguins", pose: "standing", description: "standing upright facing the viewer, arms relaxed, both boots flat on the ground" },
      { spot: "sledge", pose: "seated", description: "in a sitting posture with her thighs level, knees bent forward and both boots hanging below her, hands in her lap, upper body upright and facing the viewer" },
      { spot: "ice", pose: "peeking", description: "crouched low with her body turned to her right and her head raised and turned back towards the viewer, one mitten held up beside her shoulder" },
    ],
  },
};

async function main() {
  const sheetPath = flag("sheet"), name = flag("name"), age = Number(flag("age", "8"));
  const boardSlug = flag("board", "sydney");
  const out = flag("out", "work/sprite-probe"), budgetDir = flag("budget-dir", "work/sprite-probe/budget");
  const limit = Number(flag("limit-cents", "500"));
  const quality = flag("quality", "medium");
  const poses = Number(flag("poses", "3"));
  const withStyle = process.argv.includes("--style");
  // "hard" names the three things the reviewer said were missing rather than asking for "the same style".
  const styleStrength = flag("style-strength", "normal");
  if (!sheetPath || !name) throw new Error("--sheet and --name are required");
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const board = BOARDS[boardSlug];
  if (!board) throw new Error(`no probe recipe for board "${boardSlug}" (have: ${Object.keys(BOARDS).join(", ")})`);
  const cells = board.cells.slice(0, poses);
  mkdirSync(out, { recursive: true });

  const { OpenAiAvatarProvider } = await import("../src/infra/generation/openai");
  const { IMAGE_EDIT_RESERVE_CENTS } = await import("../src/infra/generation/image-edit-reserve");
  const { childAgeDirection } = await import("../src/domain/child-appearance");
  const { styleReference } = await import("../src/services/generation/patch");
  const { sceneBySlug } = await import("../src/services/scene-catalog.service");
  const { slotOf } = await import("../src/services/generation/authoring");

  const scene = sceneBySlug(boardSlug);
  const sheet = readFileSync(sheetPath);
  // A piece of the real board, so the child is drawn in its paint and not in
  // the model's house style. The same reference the identity sheet already uses.
  const style = withStyle
    ? await styleReference(readFileSync(path.join(process.cwd(), "public", scene.art.base)), { width: scene.art.width, height: scene.art.height }, slotOf(boardSlug, cells[0]!.spot, "A").slot)
    : null;
  if (style) writeFileSync(path.join(out, "style-reference.png"), style);

  const columns = cells.map((c, i) => `Cell ${i + 1} (left to right, position ${i + 1} of ${cells.length}): the child ${c.description}.`).join(" ");
  const prompt = [
    `Draw the SAME ONE CHILD ${cells.length} times, as ${cells.length} separate full-body figures standing side by side in a single row, on a COMPLETELY TRANSPARENT background.`,
    `The attached character reference sheet decides WHO this child is: copy the face, hair, skin tone and build exactly, in all ${cells.length} figures. It is a reference for identity only — do not copy its poses, its framing, its grid or its background.`,
    childAgeDirection(age),
    style && styleStrength !== "hard" ? `The second attached image is a piece of the illustrated world these figures belong to. Draw them in exactly that painting style: the same line quality, the same flat gouache shading, the same palette and the same level of texture. They must look painted by the hand that painted that picture, not rendered, not photographic, not glossy, not a 3D doll.` : "",
    style && styleStrength === "hard" ? `The second attached image is a piece of the illustrated world these figures belong to, painted by hand. Copy its craft exactly, and be aggressive about it: every figure gets a visible dark brown ink outline around the body, the hair and each separate piece of clothing, the same weight as the outlines on the people in that picture. Shade in FLAT blocks of colour with hard edges between light and shadow — no airbrush, no soft gradient, no glow, no blur. Leave visible dry-brush and paper texture inside the large colour areas the way that picture does. Skin is a flat painted colour with one warm shadow tone, never rendered or photographic. Match that picture's warmth and saturation. If your figure looks smooth, glossy, digital or like a photograph, you have drawn it wrong: it must look like it was cut out of that exact painting.` : "",
    `Dress the child in ${board.wardrobe}, the same outfit in every figure.`,
    `Light every figure the same way: ${board.light}.`,
    columns,
    // The first antarctica sheet came back with a snowy log under the seated
    // figure and a block of ice beside the peeking one, because the cell
    // descriptions named them. A prop drawn here is a prop that does not match
    // the board and cannot be cut off her cleanly, so no cell may name one.
    `Draw ONLY the child in every figure: no ground, no floor, no snow, no rock, no log, no seat, no sledge, no chair, no wall, no props of any kind, and nothing she holds, sits on, stands on or leans against. If a pose sounds as though it needs an object, imagine that object invisible and draw only her body in that pose.`,
    `Each figure is complete and unoccluded: her whole body from the top of her head to her feet, nothing covering, hiding or cutting off any part of any of them, and they do not overlap each other or touch.`,
    `The background must be fully transparent — no white, no colour, no checkerboard, no ground, no shadow cast on a surface, no frame, no border, no labels, no numbers, no text of any kind.`,
    `Keep a clean, sharp silhouette around every figure, including the hair: no soft halo, no glow, no outline colour bleeding into the transparency.`,
    `Draw the figures large enough to fill the height of the image.`,
  ].filter(Boolean).join(" ");
  writeFileSync(path.join(out, "prompt.txt"), prompt);

  // A high-quality 1024 sheet does not come back inside the 120 s default
  // (8 September 2026: one timed out and its reservation had to be charged).
  const provider = new OpenAiAvatarProvider(apiKey, { model: process.env.GENERATION_MODEL ?? "gpt-image-2", quality, tries: 1, timeoutMs: Number(flag("timeout-ms", "120000")), budgetMs: Number(flag("timeout-ms", "120000")) + 30_000 });
  const budget = new GenerationBudget(budgetDir, limit, { round: flag("budget-tag", "sprite-experiment-20260908") });
  console.log(`budget: ${budget.spent.toFixed(2)} of ${limit} cents already spent`);

  const reserve = IMAGE_EDIT_RESERVE_CENTS[(quality === "low" || quality === "high" ? quality : "medium") as "low" | "medium" | "high"];
  const images: Array<{ buffer: Buffer; name: string }> = [{ buffer: await sharp(sheet).resize(1024, 1024, { fit: "cover" }).png().toBuffer(), name: "character.png" }];
  if (style) images.push({ buffer: style, name: "style.png" });

  const answer = await budget.run(`sprite-probe:${boardSlug}:${quality}:${cells.length}:${styleStrength}`, reserve, () =>
    // The provider's own call path, so the wire is the one the product uses.
    (provider as unknown as { call: (p: Record<string, unknown>) => Promise<{ png: Buffer; costCents: number; model: string; providerRequestId?: string; usage?: Record<string, number>; costUnknown?: boolean }> }).call({
      images, prompt, size: "1024x1024", quality,
      label: `sprite-probe:${boardSlug}`,
      background: "transparent", outputFormat: "png",
    }),
  );
  const file = path.join(out, `sheet-${boardSlug}-${quality}-${cells.length}-${styleStrength}.png`);
  writeFileSync(file, answer.png);

  // What the alpha is actually like. This is the whole point of the probe.
  const { data, info } = await sharp(answer.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, n = w * h, ch = info.channels;
  let opaque = 0, clear = 0, partial = 0;
  const alpha = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    const a = data[i * ch + (ch - 1)]!;
    alpha[i] = a;
    if (a >= 250) opaque++; else if (a <= 5) clear++; else partial++;
  }
  // Columns of the figures: where does the row of children actually sit?
  const colInk: number[] = [];
  for (let x = 0; x < w; x++) { let c = 0; for (let y = 0; y < h; y++) if (alpha[y * w + x]! >= 128) c++; colInk.push(c); }
  const gaps: Array<[number, number]> = [];
  let runStart = -1;
  for (let x = 0; x < w; x++) {
    const empty = colInk[x]! === 0;
    if (empty && runStart < 0) runStart = x;
    if (!empty && runStart >= 0) { if (x - runStart >= 8) gaps.push([runStart, x - 1]); runStart = -1; }
  }
  if (runStart >= 0 && w - runStart >= 8) gaps.push([runStart, w - 1]);
  // Interior holes: transparent pixels fully enclosed by the silhouette.
  const outside = new Uint8Array(n);
  const queue: number[] = [];
  const push = (x: number, y: number) => { const i = y * w + x; if (alpha[i]! < 128 && !outside[i]) { outside[i] = 1; queue.push(i); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi]!, x = i % w, y = (i - (i % w)) / w;
    if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
  }
  let holes = 0;
  for (let i = 0; i < n; i++) if (alpha[i]! < 128 && !outside[i]) holes++;

  const report = {
    board: boardSlug, quality, poses: cells.length, withStyle, styleStrength,
    cost: { costCents: answer.costCents, costUnknown: Boolean(answer.costUnknown), model: answer.model, requestId: answer.providerRequestId ?? null, usage: answer.usage ?? null },
    alpha: {
      opaquePct: Math.round((opaque / n) * 1000) / 10,
      clearPct: Math.round((clear / n) * 1000) / 10,
      partialPct: Math.round((partial / n) * 1000) / 10,
      interiorHolePx: holes,
      // A real transparent answer is mostly clear with a small opaque subject.
      looksTransparent: clear / n > 0.4,
    },
    figures: { verticalGaps: gaps.length, gapRanges: gaps, separable: gaps.length >= cells.length - 1 },
    files: { sheet: path.relative(process.cwd(), file), prompt: path.relative(process.cwd(), path.join(out, "prompt.txt")) },
  };
  writeFileSync(path.join(out, `probe-${boardSlug}-${quality}-${cells.length}-${styleStrength}.json`), JSON.stringify(report, null, 2));
  // A look at the alpha on its own, and the figures on grey, for the eye.
  await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).png().toFile(path.join(out, `alpha-${boardSlug}-${quality}-${styleStrength}.png`));
  await sharp(answer.png).flatten({ background: "#808080" }).png().toFile(path.join(out, `on-grey-${boardSlug}-${quality}-${styleStrength}.png`));

  console.log(JSON.stringify(report, null, 2));
  console.log(`budget: ${budget.spent.toFixed(2)} of ${limit} cents spent${budget.held ? " (HELD)" : ""}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
