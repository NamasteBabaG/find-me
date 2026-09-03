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

export const PROMPT_VERSION = "slot-patch-v2";

/** The instruction the image model gets. Built from scene data, never hard-coded copy. */
export function slotPrompt(input: { mission: string; bodyLabel?: string; childPx: number; pose?: string }): string {
  return [
    `Paint one child into this illustration, in exactly the same style, colours, line quality and warm daylight as the picture (storybook collage).`,
    `Use the attached character reference for the child (same face, hair, hat and outfit).`,
    `Situation: ${input.mission}${input.bodyLabel ? ` (${input.bodyLabel})` : ""}.${input.pose ? ` ${input.pose}` : ""}`,
    `Place the child inside the white area of the mask, about ${input.childPx}px tall so they match the people nearby, partly hidden by whatever is naturally in front, with a soft matching shadow.`,
    `The child should be findable but not the centre of attention. Keep every other pixel of the scene unchanged.`,
  ].join(" ");
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
export function keepMainBlobs(mask: Buffer, w: number, h: number, keep: number, nearPx = Infinity): { out: Buffer; largest: number; kept: number } {
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
  return { out, largest, kept: keepIds.size };
}

export interface DiffOptions {
  /** Colour distance (0–255) above which a pixel counts as painted, inside the paint ellipse. */
  threshold?: number;
  /** Outside the ellipse the threshold is multiplied by this, so re-render drift is ignored. */
  outer?: number;
  /** How far past the ellipse a painted pixel may still belong to the child. */
  grow?: number;
  /** Blobs smaller than this fraction of the largest are dropped. */
  keep?: number;
  /** Edge softness, in pixels. */
  feather?: number;
}

export interface PatchResult {
  webp: Buffer;
  width: number;
  height: number;
  geometry: PatchGeometry;
  /** Largest painted blob, in pixels — the acceptance signal. */
  largest: number;
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
  const keep = o.keep ?? 0.2;
  const feather = o.feather ?? 6;
  const { w, h } = ctx.rect;
  const n = w * h;
  const raw1 = { raw: { width: w, height: h, channels: 1 as const } };

  const original = await sharp(input.originalCrop).resize({ width: w, height: h, fit: "cover" }).removeAlpha().raw().toBuffer();
  const edited = await sharp(input.editedCrop).resize({ width: w, height: h, fit: "cover" }).removeAlpha().raw().toBuffer();
  const allow = await sharp(paintMask(ctx, art, slot, grow)).extractChannel(0).raw().toBuffer();
  const inner = await sharp(paintMask(ctx, art, slot, 1.15)).extractChannel(0).raw().toBuffer();

  const matched = colourMatch(edited, original, allow, n);
  const diff = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    if (allow[i]! < 128) continue;
    const d = Math.max(
      Math.abs(matched[i * 3]! - original[i * 3]!),
      Math.abs(matched[i * 3 + 1]! - original[i * 3 + 1]!),
      Math.abs(matched[i * 3 + 2]! - original[i * 3 + 2]!),
    );
    diff[i] = d > (inner[i]! >= 128 ? threshold : threshold * outerFactor) ? 255 : 0;
  }

  const step = async (buf: Buffer, apply: (s: Sharp) => Sharp) => apply(sharp(buf, raw1)).extractChannel(0).raw().toBuffer();
  let cleaned: Buffer = await step(diff, (s) => s.blur(2));
  cleaned = await step(cleaned, (s) => s.threshold(150));
  cleaned = await step(cleaned, (s) => s.blur(3));
  cleaned = await step(cleaned, (s) => s.threshold(60));
  // A piece of the same child is never more than a fraction of her height away.
  const blobs = keepMainBlobs(cleaned, w, h, keep, ctx.childPx * 0.25);
  cleaned = await step(blobs.out, (s) => s.blur(feather));

  // Trim to what is left (+ a small margin) so the patch stays small.
  const box = hitBoxFromAlpha(cleaned, w, h, 9);
  if (blobs.largest === 0) throw new Error("no changed pixels found — is this the edited version of the exported crop?");
  const m = 8;
  const left = Math.max(0, box.hitRect.x - m);
  const top = Math.max(0, box.hitRect.y - m);
  const crop = { left, top, width: Math.min(w, box.hitRect.x + box.hitRect.w + m) - left, height: Math.min(h, box.hitRect.y + box.hitRect.h + m) - top };

  const rgba = await sharp(matched, { raw: { width: w, height: h, channels: 3 } }).joinChannel(cleaned, raw1).png().toBuffer();
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
    largest: blobs.largest,
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

/**
 * Did the model paint a child, or just nudge the scenery?
 *
 * A patch that passes has to look like a person standing where we asked:
 * roughly the height we specified, taller than it is wide, and centred near the
 * slot. Area alone is not enough — a re-rendered sandcastle has plenty of area.
 */
export function childProblem(result: PatchResult): string | null {
  const s = result.shape;
  if (result.largest < result.expected * 0.35) return `painted blob ${result.largest}px, expected ~${result.expected}px`;
  const h = s.height / s.childPx;
  if (h < 0.45) return `painted ${Math.round(s.height)}px tall, a child here is ~${s.childPx}px`;
  if (h > 2.2) return `painted ${Math.round(s.height)}px tall, far more than the ~${s.childPx}px asked for (the model repainted the crop)`;
  const ratio = s.width / Math.max(1, s.height);
  if (ratio > 1.6) return `painted ${Math.round(s.width)}x${Math.round(s.height)}, wider than tall, not a standing child`;
  const drift = Math.hypot(s.centerX - s.slotX, s.centerY - s.slotY) / s.childPx;
  if (drift > 1.6) return `painted ${drift.toFixed(1)} child-heights away from the hiding spot`;
  return null;
}

export function isPlausibleChild(result: PatchResult): boolean {
  return childProblem(result) === null;
}
