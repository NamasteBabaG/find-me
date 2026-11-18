import type { FaceDetector } from "@mediapipe/tasks-vision";
import type { FaceBox } from "@/domain/photo-frame";

/**
 * Where the child's face is in the parent's photo, found in the parent's own
 * browser (Guy, 2026-11-18: "the system should frame the face by itself").
 *
 * MediaPipe's BlazeFace runs on this device; nothing is sent anywhere before
 * the parent confirms the photo. Its runtime is served from this origin
 * (scripts/vendor-face-detector.mjs) and needs the CSP's 'wasm-unsafe-eval'.
 * Anything that fails here returns null and the crop opens where a portrait
 * usually puts a head, with the manual controls open.
 */

const RUNTIME = { wasmLoaderPath: "/vendor/mediapipe/vision_wasm_internal.js", wasmBinaryPath: "/vendor/mediapipe/vision_wasm_internal.wasm" };
const MODEL = "/models/blaze_face_short_range.tflite";
/** The detector sees a working copy no larger than this: quick on a weak tablet, plenty for a face. */
const WORK_EDGE = 1600;
/** Each square of the second look is drawn at most this large. */
const TILE_EDGE = 512;

let detector: Promise<FaceDetector | null> | null = null;

/**
 * The runtime announces "INFO: Created TensorFlow Lite XNNPACK delegate for CPU." through
 * console.error, which reads as a failure to anyone with the console open (and counts as an
 * issue in Next's dev overlay). Only that line is dropped, and only while the runtime runs.
 */
const RUNTIME_INFO = /^INFO: Created TensorFlow Lite XNNPACK delegate/;
async function quietly<T>(work: () => T | Promise<T>): Promise<T> {
  const original = console.error;
  console.error = (...args: unknown[]) => { if (!(typeof args[0] === "string" && RUNTIME_INFO.test(args[0]))) original.apply(console, args); };
  try { return await work(); } finally { console.error = original; }
}

/** Start loading as soon as the photo step opens; the parent takes longer to choose than this takes to load. */
export function warmFaceFinder(): Promise<FaceDetector | null> {
  detector ??= (async () => {
    try {
      const { FaceDetector } = await import("@mediapipe/tasks-vision");
      return await quietly(() => FaceDetector.createFromOptions(RUNTIME, {
        baseOptions: { modelAssetPath: MODEL, delegate: "CPU" }, runningMode: "IMAGE", minDetectionConfidence: 0.5,
      }));
    } catch {
      return null;
    }
  })();
  return detector;
}

interface Found extends FaceBox { score: number }

function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

/** Faces in `source`, in the coordinates of the region it was cut from (`x`, `y`, `scale`). */
function detect(model: FaceDetector, source: HTMLCanvasElement, x = 0, y = 0, scale = 1): Found[] {
  return model.detect(source).detections.flatMap(d => d.boundingBox ? [{
    score: d.categories[0]?.score ?? 0,
    x: x + d.boundingBox.originX * scale, y: y + d.boundingBox.originY * scale,
    width: d.boundingBox.width * scale, height: d.boundingBox.height * scale,
  }] : []);
}

/** The photo is meant to show one child; when it shows more, the nearest, surest face. */
function best(found: Found[]): Found | null {
  return found.reduce<Found | null>((top, f) => !top || f.score * f.width > top.score * top.width ? f : top, null);
}

const breathe = () => new Promise(resolve => setTimeout(resolve, 0));

/** The face's box in the image's own pixels, or null. */
export async function findFace(image: HTMLImageElement): Promise<FaceBox | null> {
  const model = await warmFaceFinder();
  const W = image.naturalWidth, H = image.naturalHeight;
  if (!model || !W || !H) return null;
  return quietly(() => search(model, image, W, H));
}

async function search(model: FaceDetector, image: HTMLImageElement, W: number, H: number): Promise<FaceBox | null> {
  try {
    const k = Math.min(1, WORK_EDGE / Math.max(W, H));
    const work = canvas(W * k, H * k);
    const ctx = work.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, work.width, work.height);
    const toImage = (f: Found | null): FaceBox | null => f && { x: f.x / k, y: f.y / k, width: f.width / k, height: f.height / k };
    const whole = best(detect(model, work));
    if (whole) return toImage(whole);
    // A child standing further away is a few pixels in the detector's small view of the whole
    // picture. Look again a square at a time: halves of the short side, then thirds.
    for (const parts of [2, 3]) {
      const side = Math.min(work.width, work.height) / parts, step = side / 2, found: Found[] = [];
      const n = Math.min(TILE_EDGE, Math.round(side));
      const tile = canvas(n, n), tctx = tile.getContext("2d");
      if (!tctx) return null;
      for (let top = 0; top + side <= work.height + 1; top += step) {
        for (let left = 0; left + side <= work.width + 1; left += step) {
          const sx = Math.min(left, work.width - side), sy = Math.min(top, work.height - side);
          tctx.drawImage(work, sx, sy, side, side, 0, 0, n, n);
          found.push(...detect(model, tile, sx, sy, side / n));
          await breathe();
        }
      }
      const face = best(found);
      if (face) return toImage(face);
    }
    return null;
  } catch {
    return null;
  }
}
