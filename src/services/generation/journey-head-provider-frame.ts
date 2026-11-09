import sharp from 'sharp';
import { journeyHeadBytesHash, journeyHeadProviderFrame } from '../../domain/generation/journey-source-head';

/** The original paid response stays immutable. One full-frame decode to the
 * game's coordinates, with identical aspect ratio and no crop or sharpening. */
export async function normalizeJourneyHeadProviderPng(original: Buffer) {
  const shape = await sharp(original, { limitInputPixels: 8294400 }).metadata();
  const frame = journeyHeadProviderFrame(shape.width, shape.height);
  const png = await sharp(original, { limitInputPixels: 8294400 })
    .resize(512, 768, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  return { png, frame: { ...frame, originalSha256: journeyHeadBytesHash(original), normalizedSha256: journeyHeadBytesHash(png) } };
}
