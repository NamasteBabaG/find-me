import sharp from 'sharp';
import { composeHeadPixelCorrection, type HeadPixelCorrection } from '../../domain/generation/head-pixel-correction';
import type { PatchRectangle } from '../../domain/scene/local-patch-return-region';
import { analysePatchSeam, boundedCompositionPermission } from './local-patch-seam';

const rgba = async (png: Buffer) => {
  const { data, info } = await sharp(png, { limitInputPixels: 8_294_400 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
};

/** Reproduce the exact original blend and qualify the new join if it moved. */
export async function correctedHeadShipping(input: { raw: Buffer; board: Buffer; crop: PatchRectangle; baseline: Buffer;
  returned: HeadPixelCorrection['returned']; heads: HeadPixelCorrection['heads']; extendedReturn?: HeadPixelCorrection['extendedReturn'] }) {
  const extension = input.extendedReturn;
  const seam = extension && await analysePatchSeam(input.board, { ...extension, left: input.crop.left + extension.left,
    top: input.crop.top + extension.top }, await sharp(input.raw).extract(extension).png().toBuffer(),
    { allowedRect: { left: 0, top: 0, width: extension.width, height: extension.height } });
  if (seam && boundedCompositionPermission(seam) !== 'aligned') throw Error('HEAD_PIXELS: the widened join is misaligned');
  const scene = await sharp(input.board, { limitInputPixels: 8_294_400 }).extract(input.crop).png().toBuffer();
  const { pixels, changed } = composeHeadPixelCorrection({ raw: await rgba(input.raw), scene: await rgba(scene), baseline: await rgba(input.baseline),
    returned: input.returned, heads: input.heads, extendedReturn: extension });
  return { png: await sharp(pixels, { raw: { width: input.crop.width, height: input.crop.height, channels: 4 } }).png().toBuffer(), changed, seam };
}
