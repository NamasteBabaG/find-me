import sharp from "sharp";
import { z } from "zod";
import { sha256Bytes } from "./fixed-sprite";

export const compositingToneSchema = z.object({
  version: z.literal("local-exposure-chroma/v1"),
  exposureStops: z.number().finite().min(-0.75).max(0),
  saturation: z.number().finite().min(0.5).max(1),
}).strict();
export type CompositingTone = z.infer<typeof compositingToneSchema>;
const linear = (v: number) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const srgb = (v: number) => v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;

/**
 * Bounded local colour grade, never a relighting/model operation. Linear-sRGB
 * luminance-preserving saturation, followed by uniform exposure attenuation.
 * Cannot brighten, increase saturation, alter alpha or move any source pixel.
 * Intrinsic complexion is not selected/segmented; identical optics are applied
 * to hair, face, hands and clothes. Correct local choices still need visual QA.
 */
export async function applyCompositingTone(source: { png: Buffer; sha256: string }, rawTone: CompositingTone) {
  const tone = compositingToneSchema.parse(rawTone), input = Buffer.from(source.png);
  if (sha256Bytes(input) !== source.sha256) throw new Error("COMPOSITING_TONE: bound source bytes changed");
  const image = sharp(input, { limitInputPixels: 25_000_000, failOn: "warning" });
  const metadata = await image.metadata();
  if (metadata.format !== "png" || (metadata.pages ?? 1) !== 1 || (metadata.orientation ?? 1) !== 1) throw new Error("COMPOSITING_TONE: single unrotated PNG required");
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data), alpha = Buffer.alloc(info.width * info.height), factor = 2 ** tone.exposureStops;
  let modifiedPixels = 0;
  for (let pixel = 0; pixel < alpha.length; pixel++) {
    const i = pixel * 4;
    alpha[pixel] = data[i + 3]!;
    if (!alpha[pixel] || tone.saturation === 1 && tone.exposureStops === 0) continue;
    const rgb = [linear(data[i]! / 255), linear(data[i + 1]! / 255), linear(data[i + 2]! / 255)];
    const luminance = 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
    for (let c = 0; c < 3; c++) {
      const graded = (luminance + tone.saturation * (rgb[c]! - luminance)) * factor;
      output[i + c] = Math.round(Math.min(1, Math.max(0, srgb(graded))) * 255);
    }
    if ([0, 1, 2].some(c => output[i + c] !== data[i + c])) modifiedPixels++;
  }
  const png = modifiedPixels ? await sharp(output, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer() : input;
  const sha256 = sha256Bytes(png);
  return { source: { png, sha256 }, provenance: {
    version: tone.version, parameters: tone,
    transform: "linear-srgb-luminance-preserving-saturation-then-exposure" as const,
    originalSourceSha256: source.sha256, derivedSourceSha256: sha256,
    alphaSha256: sha256Bytes(alpha), alphaPreservedExactly: true as const,
    width: info.width, height: info.height, modifiedPixels,
    originalSourcePreserved: true as const, geometryChanged: false as const,
    semanticStatus: "pending" as const,
  } };
}
