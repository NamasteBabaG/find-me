import sharp, { type Sharp } from "sharp";

/**
 * The slot-patch engine: how a child gets painted INTO a pre-rendered world.
 *
 * Shared by the authoring script (scripts/slot-patch.ts) and the production
 * pipeline, so a patch made by hand and a patch made for a paying customer go
 * through exactly the same maths. See docs/SPRITE_PATCHES.md.
 *
 * Nothing here talks to a database, a provider or the filesystem: it takes
 * buffers and numbers and returns buffers and numbers.
 */

export interface Size {
  width: number;
  height: number;
}

/** A rectangle in pixels of the scene art. */
export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A rectangle in fractions of the scene art (0..1) — the space slots use. */
export interface ArtRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SlotPoint {
  x: number;
  y: number;
  scale: number;
}

/** The three numbers the renderer needs; see src/game/engine/target-geometry.ts. */
export interface PatchGeometry {
  /** Where the patch image is drawn. */
  rect: ArtRect;
  /** The painted child's own footprint — what a tap has to hit. */
  hitRect: ArtRect;
  /** Top-centre of the head — where bubbles hang from. */
  anchor: { x: number; y: number };
}

export interface SlotContext {
  /** The square window cut from the art and handed to the model. */
  rect: PixelRect;
  /** How tall the child should be, in art pixels. */
  childPx: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * The window the model sees: ~7× the child's height, square, a multiple of 8,
 * clamped to the art. It must contain whatever will stand in front of the child
 * (castle, parasol, rock) or the model cannot paint them occluding her.
 */
export function slotContext(art: Size, slot: SlotPoint): SlotContext {
  const size = Math.min(art.width, art.height, Math.round(clamp(slot.scale * art.height * 7, 384, 768) / 8) * 8);
  return {
    rect: {
      x: clamp(Math.round(slot.x * art.width - size / 2), 0, art.width - size),
      y: clamp(Math.round(slot.y * art.height - size / 2), 0, art.height - size),
      w: size,
      h: size,
    },
    childPx: Math.round(slot.scale * art.height),
  };
}

/** White-on-black ellipse marking the paint area, in crop pixels. */
export function paintMask(ctx: SlotContext, art: Size, slot: SlotPoint, grow = 1): Buffer {
  const cx = slot.x * art.width - ctx.rect.x;
  const cy = slot.y * art.height - ctx.rect.y;
  const rx = Math.round(ctx.childPx * 0.55 * grow);
  const ry = Math.round(ctx.childPx * 0.8 * grow);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ctx.rect.w}" height="${ctx.rect.h}"><rect width="100%" height="100%" fill="#000"/><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff"/></svg>`,
  );
}

/**
 * A piece of a board to hand the character generator as the style to copy.
 *
 * A whole board downscaled to 1024 loses the brush texture that makes the style
 * what it is; a slot-sized crop keeps the texture but may hold nothing but sand.
 * Three child-heights around the slot is the compromise: near enough to keep the
 * grain, wide enough to catch the painted people the child has to stand among.
 */
export async function styleReference(art: Buffer, size: Size, slot: SlotPoint, out = 1024): Promise<Buffer> {
  const childPx = slot.scale * size.height;
  const want = clamp(Math.round(childPx * 3), 384, Math.min(size.width, size.height));
  const rect: PixelRect = {
    x: clamp(Math.round(slot.x * size.width - want / 2), 0, size.width - want),
    y: clamp(Math.round(slot.y * size.height - want / 2), 0, size.height - want),
    w: want,
    h: want,
  };
  return sharp(art).extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h }).resize(out, out, { fit: "cover" }).png().toBuffer();
}

export const PROMPT_VERSION = "slot-patch-v4";

/**
 * The instruction the image model gets. Built from scene data, never hard-coded copy.
 *
 * It opens by refusing the re-render and closes by refusing it again, because
 * that is the failure that costs the most: `images/edits` will happily return a
 * fresh painting of the whole window that merely resembles the input, and then
 * the diff is the entire crop rather than one child. Asking for the picture back
 * "with one child added" frames it as an edit; "paint a child into this
 * illustration" was read as an invitation to repaint the illustration.
 *
 * The reference decides WHO; the picture decides everything else. Told "same
 * face, hair and outfit", the model put one green jacket in nine countries and
 * lit it from the studio the sheet was drawn in — a child in a coat on a beach,
 * brighter than the sand under her. So the sheet is identity only: the clothes
 * belong to the place, and the light, saturation and contrast belong to the
 * board. Occlusion is asked for, not required: a child half behind a market
 * sack is the best hiding there is, and a child fully in view is still a find.
 */
export interface SlotPromptInput {
  mission: string;
  bodyLabel?: string;
  childPx: number;
  pose?: string;
  /** The place, in English, with its one-line description — what the child is dressed for. */
  place?: string;
  placeNote?: string;
  /** What the face is doing; see expressionFor(). */
  expression?: string;
}

export function slotPrompt(input: SlotPromptInput): string {
  const where = input.place ? ` (${input.place}${input.placeNote ? ` — ${input.placeNote}` : ""})` : "";
  return [
    `Return this exact picture with ONE child added to it. Do not redraw, restyle, re-render or improve any part of the picture: every pixel outside the child must come back byte for byte as it went in.`,
    `The child goes inside the white area of the mask, about ${input.childPx} pixels tall, the size of the people already standing near that spot.`,
    `The attached character reference decides WHO this child is: copy the face, hair, skin tone and build exactly. This picture decides everything else: draw the child in its own style, line quality and palette, lit by the same light from the same direction, with the same colour temperature, saturation and contrast, so they look painted by the same hand at the same hour.`,
    `Dress the child for this place${where}: everyday clothes a child would really wear here, in two or three flat colours taken from the picture's own palette, and let the weather show — a coat and hat in snow, a swimsuit or shorts on a beach, boots in a jungle — even when only the head and shoulders are in view. The clothes in the reference are not a uniform — only the child is the same.`,
    `Give the child a natural, specific expression for the moment — ${input.expression ?? expressionFor()} — never a fixed, posed smile.`,
    `Situation: ${input.mission}${input.bodyLabel ? ` (${input.bodyLabel})` : ""}.${input.pose ? ` ${input.pose}` : ""}`,
    `Let whatever is naturally in front of the child overlap them, and give them a soft shadow that matches the others. They should be findable, not the centre of attention.`,
    `Change nothing else.`,
  ].join(" ");
}

/**
 * What the face is doing, from how the body is hiding. Asked only for "the
 * child", the model draws the same faint airbrushed smile in all twenty-seven
 * places; a child crouched behind a log is mid-giggle, and one carrying a
 * bucket is concentrating on it.
 */
export function expressionFor(pose?: string): string {
  switch (pose) {
    case "peeking":
      return "mischievous and delighted, eyes wide, mid-giggle, as if about to be spotted";
    case "holding":
      return "absorbed in what they are holding, proud or concentrating, mouth relaxed";
    case "standing":
      return "curious and cheerful, looking at something happening nearby";
    default:
      return "relaxed and curious, as if nobody is watching";
  }
}

/**
 * Where a child can be tapped inside a finished patch, and where the head is —
 * both derived from the patch's own alpha, in pixels relative to the patch.
 * Feathered edges (alpha under `solid`) do not count as the child.
 */
export function hitBoxFromAlpha(alpha: Buffer, w: number, h: number, solid = 128): { hitRect: PixelRect; anchor: { x: number; y: number } } {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < w * h; i++) {
    if (alpha[i]! < solid) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return { hitRect: { x: 0, y: 0, w, h }, anchor: { x: w / 2, y: 0 } };
  // The head: centre of gravity of the top quarter of the child.
  const band = minY + Math.max(2, Math.round((maxY - minY) * 0.25));
  let sum = 0;
  let count = 0;
  for (let y = minY; y <= band; y++) for (let x = minX; x <= maxX; x++) if (alpha[y * w + x]! >= solid) { sum += x; count++; }
  return { hitRect: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, anchor: { x: count ? sum / count : (minX + maxX) / 2, y: minY } };
}

/**
 * Keep the child and drop everything else.
 *
 * The child is the largest connected blob. A hat brim, a hand or a foot can be
 * separated from it by an occluding object, so blobs of at least `keep` of its
 * area are kept too — but only if they are close to it. A pair of flip-flops
 * two metres away in the sand is drift, not part of her.
 */
export function keepMainBlobs(mask: Buffer, w: number, h: number, keep: number, nearPx = Infinity): { out: Buffer; largest: number; kept: number; keptArea: number } {
  const n = w * h;
  const label = new Int32Array(n).fill(-1);
  const areas: number[] = [];
  const boxes: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (mask[i]! < 128 || label[i] !== -1) continue;
    const id = areas.length;
    let area = 0;
    const box = { x0: w, y0: h, x1: -1, y1: -1 };
    stack.push(i);
    label[i] = id;
    while (stack.length) {
      const p = stack.pop()!;
      area++;
      const x = p % w;
      const y = (p - x) / w;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) if (q >= 0 && mask[q]! >= 128 && label[q] === -1) { label[q] = id; stack.push(q); }
    }
    areas.push(area);
    boxes.push(box);
  }
  const largest = Math.max(0, ...areas);
  const main = areas.indexOf(largest);
  const mainBox = boxes[main];
  const gap = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }) =>
    Math.hypot(Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1)), Math.max(0, Math.max(a.y0 - b.y1, b.y0 - a.y1)));
  const keepIds = new Set<number>();
  for (let id = 0; id < areas.length; id++) {
    if ((areas[id] ?? 0) < largest * keep) continue;
    if (id !== main && mainBox && boxes[id] && gap(mainBox, boxes[id]!) > nearPx) continue;
    keepIds.add(id);
  }
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) if (keepIds.has(label[i] ?? -1)) out[i] = 255;
  // `kept` counts the blobs; `keptArea` counts their pixels. The difference
  // matters: reading one for the other made the one-piece rule compare a pixel
  // count against the number 2 and pass everything, while its unit test stayed
  // green because the test supplied the number the rule was meant to get.
  let keptArea = 0;
  for (const id of keepIds) keptArea += areas[id] ?? 0;
  return { out, largest, kept: keepIds.size, keptArea };
}

export interface DiffOptions {
  /**
   * Colour distance (0–255) above which a pixel counts as painted, inside the paint ellipse.
   *
   * Lowering it to rescue a render that was rejected as too sparse is tempting
   * and wrong: on a city crop where the child was painted out of reach, dropping
   * it from 28 to 12 turned the rejection into an acceptance whose patch did not
   * contain the child at all — paving drift, person-shaped. The shape checks are
   * necessary, not sufficient, and the solidity check is what stops that from
   * shipping. Re-diffing a paid-for render more sensitively trades correct
   * rejections for false positives; pay for another roll instead.
   */
  threshold?: number;
  /** Outside the ellipse the threshold is multiplied by this, so re-render drift is ignored. */
  outer?: number;
  /** How far the full-sensitivity area reaches, in multiples of the paint ellipse. */
  inner?: number;
  /** Set false to keep the soft alpha instead of making the body opaque. */
  solidify?: boolean;
  /** How far past the ellipse a painted pixel may still belong to the child. */
  grow?: number;
  /** Blobs smaller than this fraction of the largest are dropped. */
  keep?: number;
  /** Edge softness, in pixels. */
  feather?: number;
  /** Pull the child's saturation and contrast toward the board around them (default on). */
  tone?: boolean;
}

export interface PatchResult {
  webp: Buffer;
  width: number;
  height: number;
  geometry: PatchGeometry;
  /** Largest painted blob, in pixels — the acceptance signal. */
  largest: number;
  /** Every painted pixel that survived to the patch, largest blob included. */
  painted: number;
  /** Roughly how big a child of `childPx` should be, for comparison. */
  expected: number;
  /** Shape of what was actually painted, for the acceptance check. */
  shape: { width: number; height: number; centerX: number; centerY: number; childPx: number; slotX: number; slotY: number };
}

/**
 * gpt-image "edits" does not paint only inside the mask: it returns a fresh
 * rendering of the whole crop that merely resembles the input. That shifts
 * every pixel a little, and a plain difference then keeps sand, toys and castle
 * edges instead of the child.
 *
 * So before diffing, match the edited crop back to the original using only the
 * pixels OUTSIDE the paint area, where nothing was supposed to change. A
 * per-channel least-squares fit removes the global drift and leaves the child
 * standing out.
 */
export function colourMatch(edited: Buffer, original: Buffer, outside: Buffer, n: number): Buffer {
  const out = Buffer.from(edited);
  for (let ch = 0; ch < 3; ch++) {
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (outside[i]! >= 128) continue; // inside the paint area: the child lives here
      const x = edited[i * 3 + ch]!;
      const y = original[i * 3 + ch]!;
      sx += x;
      sy += y;
      sxx += x * x;
      sxy += x * y;
      count++;
    }
    if (count < 64) continue;
    const denom = count * sxx - sx * sx;
    if (Math.abs(denom) < 1e-6) continue;
    let a = (count * sxy - sx * sy) / denom;
    let b = (sy - a * sx) / count;
    // Refuse a wild fit: this is drift correction, not a colour grade.
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0.6 || a > 1.6) {
      a = 1;
      b = (sy - sx) / count;
    }
    for (let i = 0; i < n; i++) out[i * 3 + ch] = Math.max(0, Math.min(255, Math.round(a * edited[i * 3 + ch]! + b)));
  }
  return out;
}

/**
 * Match the painted child's saturation and contrast to the board around them.
 *
 * `colourMatch` removes the model's global drift; it cannot help when the model
 * paints the child in its own house style — softer, paler and flatter than the
 * gouache around her, which is what one parent saw in four boards out of nine:
 * "not the same saturation and brightness as the picture". So the child's
 * pixels are measured against the crop's own pixels around her and pulled
 * toward them, gently. Saturation only ever goes up, by at most a third;
 * contrast is stretched about the child's own mean by at most a quarter and
 * never squeezed below nine tenths. Her mean brightness is left alone — a red
 * coat on white snow is supposed to be darker than the snow.
 */
export function toneMatch(edited: Buffer, original: Buffer, alpha: Buffer, allow: Buffer, n: number): Buffer {
  interface Stat {
    count: number;
    meanL: number;
    stdL: number;
    meanS: number;
  }
  const stat = (src: Buffer, pick: (i: number) => boolean): Stat => {
    let count = 0;
    let sumL = 0;
    let sumL2 = 0;
    let sumS = 0;
    for (let i = 0; i < n; i++) {
      if (!pick(i)) continue;
      const r = src[i * 3]!;
      const g = src[i * 3 + 1]!;
      const b = src[i * 3 + 2]!;
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      sumL += L;
      sumL2 += L * L;
      sumS += mx > 0 ? (mx - mn) / mx : 0;
      count++;
    }
    if (count === 0) return { count, meanL: 0, stdL: 0, meanS: 0 };
    const meanL = sumL / count;
    return { count, meanL, stdL: Math.sqrt(Math.max(0, sumL2 / count - meanL * meanL)), meanS: sumS / count };
  };
  const child = stat(edited, (i) => alpha[i]! >= 128);
  // The board right around her; the whole crop if the search area is nearly all child.
  let around = stat(original, (i) => alpha[i]! < 128 && allow[i]! >= 128);
  if (around.count < 400) around = stat(original, (i) => alpha[i]! < 128);
  if (child.count < 200 || around.count < 400) return edited;
  const satGain = Math.min(1.35, Math.max(1, around.meanS / Math.max(0.02, child.meanS)));
  const conGain = Math.min(1.25, Math.max(0.9, around.stdL / Math.max(1, child.stdL)));
  if (satGain < 1.02 && Math.abs(conGain - 1) < 0.02) return edited;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const out = Buffer.from(edited);
  for (let i = 0; i < n; i++) {
    if (alpha[i]! === 0) continue; // the feathered rim is her too
    const r = edited[i * 3]!;
    const g = edited[i * 3 + 1]!;
    const b = edited[i * 3 + 2]!;
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    const L2 = child.meanL + (L - child.meanL) * conGain;
    out[i * 3] = clamp(L2 + (r - L) * satGain);
    out[i * 3 + 1] = clamp(L2 + (g - L) * satGain);
    out[i * 3 + 2] = clamp(L2 + (b - L) * satGain);
  }
  return out;
}

/**
 * Turn "the crop, repainted with a child in it" into a transparent patch:
 * keep only the pixels that changed, clean them up, and measure the tap
 * contract from the result.
 *
 * sharp applies operations in a fixed order per pipeline, so each morphology
 * step is its own pass; `blur` promotes a single band to sRGB, which is why
 * every pass is forced back to one channel.
 */
export async function diffToPatch(input: {
  originalCrop: Buffer;
  editedCrop: Buffer;
  ctx: SlotContext;
  art: Size;
  slot: SlotPoint;
  options?: DiffOptions;
}): Promise<PatchResult> {
  const { ctx, art, slot } = input;
  const o = input.options ?? {};
  const threshold = o.threshold ?? 28;
  const outerFactor = o.outer ?? 2.2;
  // The model treats the mask as "where you may edit", not "put her exactly
  // here": it often paints the child a little outside the ellipse. A tight
  // search area threw those away as if nothing had been painted, so the area is
  // generous and the blob filter plus the shape check decide what is a child.
  const grow = o.grow ?? 3.6;
  // How far the child may be painted and still be seen at full sensitivity.
  //
  // Barely wider than the paint ellipse, which looks wrong — the model often
  // puts her a body-height or two out, and out there she is judged at 2.2x the
  // threshold, so a pale child on pale ground comes back as a few edges. Raising
  // it to 2.0 was tried against the thirty renders on disk and made things worse,
  // not better: the extra sensitivity picks up the scene's own re-render drift
  // faster than it picks up the child, and two renders that had been fine
  // started failing as repainted crops. The option is here so the next person
  // can re-run that experiment, not because 1.15 is a guess.
  const inner = o.inner ?? 1.15;
  const keep = o.keep ?? 0.2;
  const feather = o.feather ?? 6;
  const { w, h } = ctx.rect;
  const n = w * h;
  const raw1 = { raw: { width: w, height: h, channels: 1 as const } };

  const original = await sharp(input.originalCrop).resize({ width: w, height: h, fit: "cover" }).removeAlpha().raw().toBuffer();
  const edited = await sharp(input.editedCrop).resize({ width: w, height: h, fit: "cover" }).removeAlpha().raw().toBuffer();
  const allow = await sharp(paintMask(ctx, art, slot, grow)).extractChannel(0).raw().toBuffer();
  const near = await sharp(paintMask(ctx, art, slot, inner)).extractChannel(0).raw().toBuffer();

  const matched = colourMatch(edited, original, allow, n);
  const diff = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    if (allow[i]! < 128) continue;
    const d = Math.max(
      Math.abs(matched[i * 3]! - original[i * 3]!),
      Math.abs(matched[i * 3 + 1]! - original[i * 3 + 1]!),
      Math.abs(matched[i * 3 + 2]! - original[i * 3 + 2]!),
    );
    diff[i] = d > (near[i]! >= 128 ? threshold : threshold * outerFactor) ? 255 : 0;
  }

  const step = async (buf: Buffer, apply: (s: Sharp) => Sharp) => apply(sharp(buf, raw1)).extractChannel(0).raw().toBuffer();
  let cleaned: Buffer = await step(diff, (s) => s.blur(2));
  cleaned = await step(cleaned, (s) => s.threshold(150));
  cleaned = await step(cleaned, (s) => s.blur(3));
  cleaned = await step(cleaned, (s) => s.threshold(60));
  // A piece of the same child is never more than a fraction of her height away.
  const blobs = keepMainBlobs(cleaned, w, h, keep, ctx.childPx * 0.25);
  cleaned = await step(blobs.out, (s) => s.blur(feather));
  // Feathering the whole mask left the child herself half-transparent: across
  // one nine-board game only a fifth of the drawn pixels were fully opaque, and
  // in the board that reads as a washed-out, pasted-on child you can see the bus
  // through. The edge still needs to be soft, so the curve pushes the body to
  // opaque and keeps a narrow band of anti-aliasing at the rim.
  if (o.solidify !== false) cleaned = await step(cleaned, (s) => s.linear(255 / 64, -(255 / 64) * 40));

  // Trim to what is left (+ a small margin) so the patch stays small.
  // Count the pieces on the finished alpha, not on the pre-feather mask: a
  // child cut in two by a railing is joined back together by the feather, and
  // rejecting her for that would be rejecting the occlusion we asked for.
  const pieces = keepMainBlobs(cleaned, w, h, 0.05);
  const box = hitBoxFromAlpha(cleaned, w, h, 9);
  // Nothing changed. This used to throw, which in production was wrong twice
  // over: the roll cost money and was charged as two attempts (one for the call,
  // one for the exception), and the render that shows WHY nothing was painted
  // was thrown away with it. It is an ordinary rejection — childProblem says so.
  if (pieces.largest === 0) return nothingPainted(ctx, art, slot);
  const m = 8;
  const left = Math.max(0, box.hitRect.x - m);
  const top = Math.max(0, box.hitRect.y - m);
  const crop = { left, top, width: Math.min(w, box.hitRect.x + box.hitRect.w + m) - left, height: Math.min(h, box.hitRect.y + box.hitRect.h + m) - top };

  // Only now, with her outline known: the child's own pixels, toned to the board.
  const toned = o.tone === false ? matched : toneMatch(matched, original, cleaned, allow, n);
  const rgba = await sharp(toned, { raw: { width: w, height: h, channels: 3 } }).joinChannel(cleaned, raw1).png().toBuffer();
  const webp = await sharp(rgba).extract(crop).webp({ quality: 92, alphaQuality: 100 }).toBuffer();

  // The tap contract, measured on the finished patch and expressed in art fractions.
  const solid = await sharp(webp).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const hb = hitBoxFromAlpha(solid.data, solid.info.width, solid.info.height);
  const px = { x: ctx.rect.x + crop.left, y: ctx.rect.y + crop.top };
  return {
    webp,
    width: crop.width,
    height: crop.height,
    geometry: {
      rect: { x: px.x / art.width, y: px.y / art.height, w: crop.width / art.width, h: crop.height / art.height },
      hitRect: { x: (px.x + hb.hitRect.x) / art.width, y: (px.y + hb.hitRect.y) / art.height, w: hb.hitRect.w / art.width, h: hb.hitRect.h / art.height },
      anchor: { x: (px.x + hb.anchor.x) / art.width, y: (px.y + hb.anchor.y) / art.height },
    },
    largest: pieces.largest,
    painted: pieces.keptArea,
    // A child of `childPx` fills roughly 0.75 × childPx wide and ~55% of that box.
    expected: Math.round(ctx.childPx * ctx.childPx * 0.75 * 0.55),
    shape: {
      width: box.hitRect.w,
      height: box.hitRect.h,
      centerX: ctx.rect.x + box.hitRect.x + box.hitRect.w / 2,
      centerY: ctx.rect.y + box.hitRect.y + box.hitRect.h / 2,
      childPx: ctx.childPx,
      slotX: slot.x * art.width,
      slotY: slot.y * art.height,
    },
  };
}

/** A result that fails every check: the model returned the crop unchanged. */
function nothingPainted(ctx: SlotContext, art: Size, slot: SlotPoint): PatchResult {
  const zero = { x: 0, y: 0, w: 0, h: 0 };
  return {
    webp: Buffer.alloc(0),
    width: 0,
    height: 0,
    geometry: { rect: zero, hitRect: zero, anchor: { x: 0, y: 0 } },
    largest: 0,
    painted: 0,
    expected: Math.round(ctx.childPx * ctx.childPx * 0.75 * 0.55),
    shape: { width: 0, height: 0, centerX: 0, centerY: 0, childPx: ctx.childPx, slotX: slot.x * art.width, slotY: slot.y * art.height },
  };
}

/**
 * Did the model paint a child, or just nudge the scenery?
 *
 * A patch that passes has to look like a person: roughly the height we asked
 * for, taller than wide, solid rather than scattered, and near the spot.
 *
 * Two of these checks used to be measured against the wrong thing, and between
 * them they threw away most of the good work — about half of every roll paid
 * for. A child crouched behind market sacks shows a fraction of her silhouette,
 * so judging her by the area a whole child would cover rejected exactly the best
 * hiding we asked for; and a child painted larger than requested drifts further
 * from the spot in proportion, so measuring that drift in the height we asked
 * for rejected her twice for one deviation. Both now measure what is actually
 * on the canvas: how solid the blob is inside its own outline, and how far it
 * sits in terms of its own size.
 */
export function childProblem(result: PatchResult): string | null {
  const s = result.shape;
  if (result.largest === 0) return "painted nothing — the crop came back unchanged";
  const h = s.height / s.childPx;
  if (h < 0.45) return `painted ${Math.round(s.height)}px tall, a child here is ~${s.childPx}px`;
  if (h > 2.2) return `painted ${Math.round(s.height)}px tall, far more than the ~${s.childPx}px asked for (the model repainted the crop)`;
  const ratio = s.width / Math.max(1, s.height);
  if (ratio > 1.6) return `painted ${Math.round(s.width)}x${Math.round(s.height)}, wider than tall, not a standing child`;
  // The prompt asks for a child about 0.75 x childPx across, so width is worth
  // measuring against that and not only against her own height — a vertical
  // strip of hair and one eye has a perfectly childlike height, density and
  // position, and is none of the things the other rules look at. Both limits
  // rest on a single sample each, but each sits in a clean gap: across
  // twenty-seven renders the next narrowest was 0.45 and the next widest 1.21.
  const askedWide = 0.75 * s.childPx;
  const across = s.width / Math.max(1, askedWide);
  if (across < 0.38) return `painted ${Math.round(s.width)}px across where a child is ~${Math.round(askedWide)}px — a strip of the child, not the child`;
  if (across > 1.4) return `painted ${Math.round(s.width)}px across where a child is ~${Math.round(askedWide)}px — more than one child, or the child and the scenery`;
  // A body fills roughly half its own bounding box, even mostly hidden; specks
  // and scenery edges scattered across a box fill very little of one.
  const density = result.largest / Math.max(1, s.width * s.height);
  if (density < 0.22) return `painted ${Math.round(density * 100)}% of its own outline — scattered marks, not a child`;
  // A child arrives in one piece. Across twenty-seven real renders every good
  // one was a single connected shape and both exceptions were defects: one body
  // severed at the waist, one child with a loose smear of scenery beside her.
  // The retry costs two cents; a smudge on the board is what the child sees.
  const whole = result.largest / Math.max(1, result.painted);
  if (whole < 0.95) return `painted in pieces — the body holds only ${Math.round(whole * 100)}% of what was drawn`;
  // Judge the distance by the child who was painted, never by a smaller one we
  // imagined; but an undersized child is still held to the size we asked for.
  //
  // The limit is loose on purpose. The search area (`grow`, 3.6x the ellipse)
  // already decides how far from the slot a child can be found at all, so a
  // second, tighter rule here only threw away good work: the model reads the
  // mask as "where you may edit", puts her at the nearest place that makes sense
  // — beside the lifebuoy, in front of the bus, under the kite — and that is
  // two body-heights out often enough. She is still at the landmark the mission
  // names, and the tap contract follows the patch, not the slot.
  const yardstick = Math.max(s.height, s.childPx);
  const drift = Math.hypot(s.centerX - s.slotX, s.centerY - s.slotY) / yardstick;
  if (drift > 2.5) return `painted ${drift.toFixed(1)} child-heights away from the hiding spot`;
  return null;
}

export function isPlausibleChild(result: PatchResult): boolean {
  return childProblem(result) === null;
}
