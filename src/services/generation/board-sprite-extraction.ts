import sharp, { type OutputInfo } from "sharp";
import { pointInPolygon, sha256Bytes } from "./fixed-sprite";
import type { SimplePeekInput } from "./simple-peek";

type Point = SimplePeekInput["source"]["eye"];
type Rect = SimplePeekInput["slot"]["window"];
type Measurement = SimplePeekInput["source"]["measurement"];
type Edge = "left" | "top" | "right" | "bottom";

export interface BoardSpriteSeed {
  slotId: string;
  /** Observed native sheet pixel-edge coordinates, never normalized or snapped. */
  eye: Point;
  chin: Point;
  protectedFacePolygon: Point[];
  measurement: Measurement;
}

export interface BoardSpriteFrameEvidence {
  /** Counts each boundary pixel once, including corners. */
  pixelCount: number;
  strongPixelCount: number;
  maxAlpha: number;
  edges: Record<Edge, { pixelCount: number; strongPixelCount: number; maxAlpha: number }>;
}

export interface BoardSpriteComponent {
  id: number;
  strongPixels: number;
  bounds: Rect;
}

export interface ExtractedBoardSprite {
  slotId: string;
  png: Buffer;
  sha256: string;
  width: number;
  height: number;
  eye: Point;
  chin: Point;
  protectedFacePolygon: Point[];
  measurement: Measurement;
  extraction: {
    component: BoardSpriteComponent;
    sourceSheetBounds: Rect;
    sheetToSource: { scale: 1; translateX: number; translateY: number };
    padding: Record<Edge, number>;
    retainedPixels: number;
    retainedWeakPixels: number;
    protectedFacePixels: number;
    originalFrameContact: Record<Edge, boolean>;
    /** Attached weak contact is evidence, not a declaration that clipping is harmless. */
    originalFrame: BoardSpriteFrameEvidence;
    boundaryStatus: "clear" | "weak-only";
    requiresBoundaryReview: boolean;
    noResampling: true;
    noRecoloring: true;
    sourceRgbaPreserved: true;
  };
}

export const BOARD_SPRITE_EXTRACTION_POLICY = Object.freeze({
  version: "board-sprite-extraction/v2" as const,
  expectedSprites: 3,
  strongAlpha: 32,
  protectedFaceAlpha: 224,
  attachedFringePx: 3,
  paddingPx: 8,
  minimumStrongComponentPixels: 32,
  /** Small detached speckles are reported, not silently included in a figure. */
  maximumUnseededStrongPixels: 64,
  /** Bounds the labelling pass alone. The noise ceiling is the 64 detached
   * pixels above, judged after hair adoption; counting COMPONENTS against that
   * pixel budget rejected sheets with three clean figures and invisible dust
   * (9 September 2026: giza at 74 components, amazon at 69, none of their
   * speckles reaching the 32-pixel minimum) before either real gate ran. */
  maximumStrongComponents: 4096,
  maximumSheetPixels: 8_388_608,
});

export type BoardSpriteExtractionErrorCode =
  | "invalid-input" | "bound-sheet-mismatch" | "decode-failed"
  | "invalid-landmarks" | "merged-sources" | "wrong-source-count"
  | "unusable-face" | "unusable-source" | "strong-frame-contact" | "ambiguous-fringe";

export class BoardSpriteExtractionError extends Error {
  constructor(
    public readonly code: BoardSpriteExtractionErrorCode,
    message: string,
    public readonly evidence: Readonly<Record<string, unknown>> = {},
  ) {
    super(`BOARD_SPRITE_EXTRACTION: ${message}`);
    this.name = "BoardSpriteExtractionError";
  }
}

const fail = (code: BoardSpriteExtractionErrorCode, message: string, evidence?: Record<string, unknown>): never => {
  throw new BoardSpriteExtractionError(code, message, evidence);
};
const simplePolygon = (input: Point[]) => {
  const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
  const points = same(input[0]!, input[input.length - 1]!) ? input.slice(0, -1) : input;
  if (points.length < 3) return false;
  const cross = (a: Point, b: Point, p: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const on = (a: Point, b: Point, p: Point) => Math.abs(cross(a, b, p)) < 1e-9
    && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    if (same(a, b)) return false;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j]!, d = points[(j + 1) % points.length]!;
      if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
        || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)) return false;
    }
  }
  return true;
};
const freshFrame = (): BoardSpriteFrameEvidence => ({
  pixelCount: 0, strongPixelCount: 0, maxAlpha: 0,
  edges: {
    left: { pixelCount: 0, strongPixelCount: 0, maxAlpha: 0 },
    top: { pixelCount: 0, strongPixelCount: 0, maxAlpha: 0 },
    right: { pixelCount: 0, strongPixelCount: 0, maxAlpha: 0 },
    bottom: { pixelCount: 0, strongPixelCount: 0, maxAlpha: 0 },
  },
});
const addFramePixel = (frame: BoardSpriteFrameEvidence, x: number, y: number, w: number, h: number, alpha: number) => {
  if (!alpha || (x !== 0 && y !== 0 && x !== w - 1 && y !== h - 1)) return;
  frame.pixelCount++;
  if (alpha >= BOARD_SPRITE_EXTRACTION_POLICY.strongAlpha) frame.strongPixelCount++;
  frame.maxAlpha = Math.max(frame.maxAlpha, alpha);
  for (const edge of ["left", "top", "right", "bottom"] as const) {
    if ((edge === "left" && x !== 0) || (edge === "top" && y !== 0)
      || (edge === "right" && x !== w - 1) || (edge === "bottom" && y !== h - 1)) continue;
    frame.edges[edge].pixelCount++;
    if (alpha >= BOARD_SPRITE_EXTRACTION_POLICY.strongAlpha) frame.edges[edge].strongPixelCount++;
    frame.edges[edge].maxAlpha = Math.max(frame.edges[edge].maxAlpha, alpha);
  }
};

/** Extract exactly three observed figures without any board placement, anatomy,
 * image generation, landmark inference, alpha repair, or photometric adjustment.
 * Weak original-edge pixels remain on that edge (zero padding on contacted sides),
 * so downstream frame guards cannot be defeated by transparent padding. */
export async function extractBoardSprites(input: {
  sheetPng: Buffer;
  expectedSheetSha256?: string;
  seeds: readonly BoardSpriteSeed[];
}): Promise<{
  version: "board-sprite-extraction/v2";
  sheetSha256: string;
  sheetRgbaSha256: string;
  width: number;
  height: number;
  policy: typeof BOARD_SPRITE_EXTRACTION_POLICY;
  components: BoardSpriteComponent[];
  unseededComponents: BoardSpriteComponent[];
  attachedDetailComponents: Array<{ componentId: number; slotId: string }>;
  /** Raw entire sheet edge, distinct from component-attached fringe evidence. */
  sheetFrame: BoardSpriteFrameEvidence;
  sprites: ExtractedBoardSprite[];
}> {
  const policy = BOARD_SPRITE_EXTRACTION_POLICY;
  if (!input || !Buffer.isBuffer(input.sheetPng) || !input.sheetPng.length
    || !Array.isArray(input.seeds) || input.seeds.length !== policy.expectedSprites) {
    fail("invalid-input", "a PNG sheet and exactly three observed seeds are required");
  }
  // Hold one immutable input snapshot across asynchronous image decoding.
  const sheetPng = Buffer.from(input.sheetPng);
  const seeds: BoardSpriteSeed[] = (() => {
    try { return structuredClone(input.seeds) as BoardSpriteSeed[]; }
    catch { return fail("invalid-input", "observed seeds must be serializable source data"); }
  })();
  const sheetSha256 = sha256Bytes(sheetPng);
  if (input.expectedSheetSha256 !== undefined && input.expectedSheetSha256 !== sheetSha256) {
    fail("bound-sheet-mismatch", "sheet bytes differ from their expected SHA256");
  }
  let decoded: { data: Buffer; info: OutputInfo } | undefined;
  try {
    const image = sharp(sheetPng, { limitInputPixels: policy.maximumSheetPixels, failOn: "warning" });
    const meta = await image.metadata();
    if (meta.format !== "png" || (meta.pages ?? 1) !== 1 || meta.depth !== "uchar" || !meta.hasAlpha) {
      fail("invalid-input", "a single-frame 8-bit PNG with native alpha is required");
    }
    decoded = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof BoardSpriteExtractionError) throw error;
    fail("decode-failed", "sheet could not be fully decoded as a bounded PNG");
  }
  if (!decoded) return fail("decode-failed", "sheet did not decode");
  const { data, info } = decoded;
  const w = info.width, h = info.height, n = w * h;
  if (info.channels !== 4 || w < 3 || h < 3 || n > policy.maximumSheetPixels) fail("invalid-input", "invalid RGBA sheet dimensions");
  const validPoint = (p: Point) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
    && p.x >= 0 && p.y >= 0 && p.x < w && p.y < h;
  const ids = new Set<string>();
  for (const s of seeds) {
    if (!s || typeof s.slotId !== "string" || s.slotId !== s.slotId.trim() || !s.slotId || s.slotId.length > 200 || ids.has(s.slotId)) {
      fail("invalid-input", "three distinct canonical slot IDs are required");
    }
    ids.add(s.slotId);
    if (!validPoint(s.eye) || !validPoint(s.chin) || s.chin.y <= s.eye.y
      || !Array.isArray(s.protectedFacePolygon) || s.protectedFacePolygon.length < 3 || s.protectedFacePolygon.length > 64
      || !s.protectedFacePolygon.every(validPoint)) fail("invalid-landmarks", "finite native eye/chin and face points inside the sheet are required", { slotId: s.slotId });
    let area = 0;
    s.protectedFacePolygon.forEach((p, i) => { const q = s.protectedFacePolygon[(i + 1) % s.protectedFacePolygon.length]!; area += p.x * q.y - q.x * p.y; });
    if (Math.abs(area) < 0.001 || !simplePolygon(s.protectedFacePolygon)
      || !pointInPolygon(s.eye, s.protectedFacePolygon)
      || !pointInPolygon({ x: (s.eye.x + s.chin.x) / 2, y: (s.eye.y + s.chin.y) / 2 }, s.protectedFacePolygon)) {
      // The observer deliberately protects opaque inner facial skin, not the
      // silhouette boundary. The chin is separately opacity/component checked.
      fail("invalid-landmarks", "simple nonzero face polygon must contain its observed eye and midface", { slotId: s.slotId });
    }
    if (!s.measurement || !["observed", "manual-pilot"].includes(s.measurement.kind)
      || typeof s.measurement.note !== "string" || !s.measurement.note.trim()) fail("invalid-input", "source measurement provenance is required", { slotId: s.slotId });
  }

  const labels = new Int32Array(n), queue = new Int32Array(n), components: BoardSpriteComponent[] = [];
  const detailPixels = new Map<number, Int32Array>();
  const adjacent = (i: number, visit: (next: number) => void) => {
    const x = i % w, y = Math.floor(i / w);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < w && yy >= 0 && yy < h) visit(yy * w + xx);
    }
  };
  const sheetFrame = freshFrame();
  for (let i = 0; i < n; i++) addFramePixel(sheetFrame, i % w, Math.floor(i / w), w, h, data[i * 4 + 3]!);
  for (let start = 0; start < n; start++) {
    if (labels[start] || data[start * 4 + 3]! < policy.strongAlpha) continue;
    const id = components.length + 1;
    let head = 0, tail = 1, left = w, top = h, right = -1, bottom = -1;
    labels[start] = id; queue[0] = start;
    while (head < tail) {
      const i = queue[head++]!, x = i % w, y = Math.floor(i / w);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      adjacent(i, next => {
        if (!labels[next] && data[next * 4 + 3]! >= policy.strongAlpha) { labels[next] = id; queue[tail++] = next; }
      });
    }
    components.push({ id, strongPixels: tail, bounds: { left, top, width: right - left + 1, height: bottom - top + 1 } });
    if (tail < policy.minimumStrongComponentPixels) detailPixels.set(id, queue.slice(0, tail));
    if (components.length > policy.expectedSprites + policy.maximumStrongComponents) {
      fail("wrong-source-count", "sheet contains more disconnected strong components than the labelling pass will process");
    }
  }
  const sourceLabels = seeds.map(s => {
    const eyeIndex = Math.floor(s.eye.y) * w + Math.floor(s.eye.x), chinIndex = Math.floor(s.chin.y) * w + Math.floor(s.chin.x);
    if (data[eyeIndex * 4 + 3]! < policy.protectedFaceAlpha || data[chinIndex * 4 + 3]! < policy.protectedFaceAlpha
      || !labels[eyeIndex] || labels[eyeIndex] !== labels[chinIndex]) fail("unusable-face", "eye and chin must touch the same opaque source component", { slotId: s.slotId });
    return labels[eyeIndex]!;
  });
  if (new Set(sourceLabels).size !== policy.expectedSprites) fail("merged-sources", "observed figures share a connected alpha component", { sourceLabels });
  const selected = new Set(sourceLabels), unseededComponents = components.filter(c => !selected.has(c.id));
  if (sourceLabels.some(id => components[id - 1]!.strongPixels < policy.minimumStrongComponentPixels)
    || unseededComponents.some(c => c.strongPixels >= policy.minimumStrongComponentPixels)) {
    fail("wrong-source-count", "expected exactly three usable figures, apart from bounded detached speckles", { components, unseededComponents });
  }

  const facePixelCounts = seeds.map((s, index) => {
    const polygon = s.protectedFacePolygon;
    const left = Math.floor(Math.min(...polygon.map(p => p.x))), right = Math.ceil(Math.max(...polygon.map(p => p.x)));
    const top = Math.floor(Math.min(...polygon.map(p => p.y))), bottom = Math.ceil(Math.max(...polygon.map(p => p.y)));
    let pixels = 0;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      if (!pointInPolygon({ x: x + 0.5, y: y + 0.5 }, polygon)) continue;
      pixels++;
      const i = y * w + x;
      if (labels[i] !== sourceLabels[index] || data[i * 4 + 3]! < policy.protectedFaceAlpha) {
        fail("unusable-face", "protected face has a missing, translucent, or foreign-component pixel", { slotId: s.slotId, x, y });
      }
    }
    if (!pixels) fail("unusable-face", "protected face contains no native pixel samples", { slotId: s.slotId });
    return pixels;
  });

  const owners = new Uint8Array(n), distances = new Uint8Array(n);
  distances.fill(255);
  // A bounded 0/1 deque: existing weak pixels cost one fringe pixel, while
  // traversing a tiny strong hair island costs zero. Clear alpha is never crossed.
  // Unlike threshold-component counting, this preserves physically attached
  // strands without admitting another figure, a prop, or disconnected noise.
  let head = 0, tail = 0, pending = 0;
  const enqueue = (i: number, front = false) => {
    if (front) { head = (head + n - 1) % n; queue[head] = i; }
    else { queue[tail] = i; tail = (tail + 1) % n; }
    pending++;
  };
  for (let i = 0; i < n; i++) {
    const index = sourceLabels.indexOf(labels[i]!);
    if (index < 0) continue;
    if (i % w === 0 || i % w === w - 1 || Math.floor(i / w) === 0 || Math.floor(i / w) === h - 1) {
      fail("strong-frame-contact", "a strong source component is clipped by the original sheet frame", { slotId: seeds[index]!.slotId, x: i % w, y: Math.floor(i / w), alpha: data[i * 4 + 3] });
    }
    owners[i] = index + 1; distances[i] = 0; enqueue(i);
  }
  const detailOwners = new Map<number, number>();
  while (pending) {
    const i = queue[head]!; head = (head + 1) % n; pending--;
    adjacent(i, next => {
      if (!data[next * 4 + 3]) return;
      const label = labels[next]!;
      if (label) {
        if (selected.has(label)) {
          if (owners[next] !== owners[i]) fail("ambiguous-fringe", "attached alpha connects different figures", { x: next % w, y: Math.floor(next / w) });
          return;
        }
        const prior = detailOwners.get(label);
        if (prior && prior !== owners[i]) fail("ambiguous-fringe", "a tiny strong detail is shared by different figures", { componentId: label });
        if (prior) return;
        detailOwners.set(label, owners[i]!);
        for (const pixel of detailPixels.get(label)!) {
          owners[pixel] = owners[i]!; distances[pixel] = distances[i]!; enqueue(pixel, true);
        }
        return;
      }
      if (distances[i]! >= policy.attachedFringePx) return;
      if (owners[next] && owners[next] !== owners[i]) fail("ambiguous-fringe", "attached weak alpha is shared by different figures", { x: next % w, y: Math.floor(next / w) });
      if (owners[next]) return;
      owners[next] = owners[i]!; distances[next] = distances[i]! + 1; enqueue(next);
    });
  }
  const detachedComponents = unseededComponents.filter(c => !detailOwners.has(c.id));
  if (detachedComponents.reduce((sum, c) => sum + c.strongPixels, 0) > policy.maximumUnseededStrongPixels) {
    fail("wrong-source-count", "detached strong speckles exceed the noise allowance after preserving attached hair details", { components, detachedComponents });
  }

  const sprites: ExtractedBoardSprite[] = [];
  for (const [index, seed] of seeds.entries()) {
    let left = w, top = h, right = -1, bottom = -1, retainedPixels = 0, retainedWeakPixels = 0;
    const originalFrame = freshFrame();
    for (let i = 0; i < n; i++) {
      if (owners[i] !== index + 1) continue;
      const x = i % w, y = Math.floor(i / w), a = data[i * 4 + 3]!;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      retainedPixels++; if (a < policy.strongAlpha) retainedWeakPixels++;
      addFramePixel(originalFrame, x, y, w, h, a);
    }
    if (!retainedPixels) fail("unusable-source", "empty extracted source", { slotId: seed.slotId });
    if (originalFrame.strongPixelCount) fail("strong-frame-contact", "attached strong detail touches the original sheet frame", { slotId: seed.slotId, originalFrame });
    const originalFrameContact = { left: left === 0, top: top === 0, right: right === w - 1, bottom: bottom === h - 1 };
    const padding = {
      left: originalFrameContact.left ? 0 : policy.paddingPx, top: originalFrameContact.top ? 0 : policy.paddingPx,
      right: originalFrameContact.right ? 0 : policy.paddingPx, bottom: originalFrameContact.bottom ? 0 : policy.paddingPx,
    };
    const width = right - left + 1 + padding.left + padding.right, height = bottom - top + 1 + padding.top + padding.bottom;
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const i = y * w + x;
      if (owners[i] === index + 1) data.copy(rgba, ((y - top + padding.top) * width + x - left + padding.left) * 4, i * 4, i * 4 + 4);
    }
    const png = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const translateX = padding.left - left, translateY = padding.top - top;
    const translate = (p: Point): Point => ({ x: p.x + translateX, y: p.y + translateY });
    sprites.push({
      slotId: seed.slotId, png, sha256: sha256Bytes(png), width, height,
      eye: translate(seed.eye), chin: translate(seed.chin), protectedFacePolygon: seed.protectedFacePolygon.map(translate), measurement: { ...seed.measurement },
      extraction: {
        component: components[sourceLabels[index]! - 1]!, sourceSheetBounds: { left, top, width: right - left + 1, height: bottom - top + 1 },
        sheetToSource: { scale: 1, translateX, translateY }, padding, retainedPixels, retainedWeakPixels, protectedFacePixels: facePixelCounts[index]!,
        originalFrameContact, originalFrame, boundaryStatus: originalFrame.pixelCount ? "weak-only" : "clear", requiresBoundaryReview: originalFrame.pixelCount > 0,
        noResampling: true, noRecoloring: true, sourceRgbaPreserved: true,
      },
    });
  }
  return { version: policy.version, sheetSha256, sheetRgbaSha256: sha256Bytes(data), width: w, height: h, policy, components,
    unseededComponents: detachedComponents,
    attachedDetailComponents: [...detailOwners].map(([componentId, owner]) => ({ componentId, slotId: seeds[owner - 1]!.slotId })),
    sheetFrame, sprites };
}
