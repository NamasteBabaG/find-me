import sharp from "sharp";
import type { AvatarInput, AvatarOutput, AvatarProvider, FaceDetection, FaceDetector, TargetSpriteInput, TargetSpriteOutput } from "./types";

const STICKER_SIZE = 512;
const RING = 22;

/**
 * Photo-sticker avatar: the "even simpler MVP" strategy from the spec.
 * The child's real face (cropped by the parent) becomes a round paper
 * sticker with a white outline, composed onto illustrated bodies at runtime.
 */
export class MockAvatarProvider implements AvatarProvider {
  readonly id = "mock" as const;

  async createAvatar(input: AvatarInput): Promise<AvatarOutput> {
    const image = sharp(input.originalPhoto, { failOn: "none" }).rotate();
    const meta = await image.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (!w || !h) throw new Error("Cannot read photo dimensions");

    const crop = input.crop ?? centeredSquare(w, h);
    const left = clamp(Math.round(crop.x * w), 0, w - 1);
    const top = clamp(Math.round(crop.y * h), 0, h - 1);
    const width = clamp(Math.round(crop.w * w), 1, w - left);
    const height = clamp(Math.round(crop.h * h), 1, h - top);
    const side = Math.min(width, height);

    const face = await image.extract({ left, top, width: side, height: side }).resize(STICKER_SIZE, STICKER_SIZE).png().toBuffer();

    const inner = STICKER_SIZE / 2 - RING;
    const circleMask = Buffer.from(
      `<svg width="${STICKER_SIZE}" height="${STICKER_SIZE}"><circle cx="${STICKER_SIZE / 2}" cy="${STICKER_SIZE / 2}" r="${inner}" fill="#fff"/></svg>`,
    );
    const ring = Buffer.from(
      `<svg width="${STICKER_SIZE}" height="${STICKER_SIZE}"><circle cx="${STICKER_SIZE / 2}" cy="${STICKER_SIZE / 2}" r="${STICKER_SIZE / 2 - 2}" fill="#fff"/></svg>`,
    );

    const masked = await sharp(face).composite([{ input: circleMask, blend: "dest-in" }]).png().toBuffer();
    const png = await sharp(ring).composite([{ input: masked, blend: "over" }]).png().toBuffer();

    return { png, width: STICKER_SIZE, height: STICKER_SIZE, costCents: 0, providerRequestId: "mock" };
  }

  async createTargetSprite(_input: TargetSpriteInput): Promise<TargetSpriteOutput> {
    // Bodies are drawn procedurally by the renderer — nothing to generate.
    return { kind: "composed", costCents: 0 };
  }
}

/** No ML yet: the parent crops manually. Swapping in a real detector is one class. */
export class NoopFaceDetector implements FaceDetector {
  async detect(): Promise<FaceDetection> {
    return { count: 1, box: null };
  }
}

function centeredSquare(w: number, h: number) {
  const side = Math.min(w, h);
  return { x: (w - side) / 2 / w, y: (h - side) / 2 / h, w: side / w, h: side / h };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
