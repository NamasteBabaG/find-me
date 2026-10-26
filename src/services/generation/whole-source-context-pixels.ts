import { createHash } from "node:crypto";
import sharp from "sharp";
import { planWholeSourceContext, assertWholeSourceContextPlan, type WholeSourceContextPlan } from "../../domain/scene/whole-source-context";
import type { PatchRectangle } from "../../domain/scene/local-patch-return-region";
import type { SourceNeighborContract } from "../../domain/scene/local-patch-source-neighbors";

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const MAX_PIXELS = 8_294_400;
async function pngShape(bytes: Buffer, width: number, height: number, purpose: string): Promise<void> {
  const image = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "warning" }), meta = await image.metadata();
  if (meta.format !== "png" || meta.width !== width || meta.height !== height || (meta.pages ?? 1) !== 1)
    throw Error(`WHOLE_SOURCE_CONTEXT: ${purpose} has a different native raster`);
  await image.raw().toBuffer();
}

/** Read-only preparation. No provider, ledger, asset, job or publication access. */
export async function prepareWholeSourceContextPixels(input: {
  sourceFile: Buffer; contract: SourceNeighborContract; child: PatchRectangle;
  originalMaskPng: Buffer; originalGuidePng?: Buffer;
}) {
  // Own the bytes before the first await; replay cannot observe caller mutation.
  const sourceFile = Buffer.from(input.sourceFile), originalMaskPng = Buffer.from(input.originalMaskPng);
  const originalGuidePng = input.originalGuidePng && Buffer.from(input.originalGuidePng);
  const contract = structuredClone(input.contract), child = { ...input.child };
  const plan = planWholeSourceContext(contract, child);
  if (sha256(sourceFile) !== plan.source.sha256) throw Error("WHOLE_SOURCE_CONTEXT: original public source hash changed");
  const original = sharp(sourceFile, { limitInputPixels: MAX_PIXELS, failOn: "warning" }), meta = await original.metadata();
  if (meta.width !== plan.source.width || meta.height !== plan.source.height || (meta.pages ?? 1) !== 1)
    throw Error("WHOLE_SOURCE_CONTEXT: original public source dimensions changed");
  await original.raw().toBuffer();
  await pngShape(originalMaskPng, plan.shipping.width, plan.shipping.height, "original edit mask");
  if (!(await sharp(originalMaskPng).metadata()).hasAlpha) throw Error("WHOLE_SOURCE_CONTEXT: edit mask requires its native alpha channel");
  if (originalGuidePng) await pngShape(originalGuidePng, plan.shipping.width, plan.shipping.height, "original placement guide");
  const stylePng = await sharp(sourceFile, { limitInputPixels: MAX_PIXELS }).extract(plan.provider).png().toBuffer();
  const at = { left: plan.shippingInProvider.left, top: plan.shippingInProvider.top };
  // Everything newly visible is protected. Every original mask pixel stays exact.
  const maskPng = await sharp(originalMaskPng).extend({ ...at,
    right: plan.provider.width - at.left - plan.shipping.width,
    bottom: plan.provider.height - at.top - plan.shipping.height,
    background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer();
  const placementGuidePng = originalGuidePng
    ? await sharp(stylePng).composite([{ input: originalGuidePng, ...at }]).png().toBuffer() : undefined;
  return { plan, stylePng, maskPng, ...(placementGuidePng ? { placementGuidePng } : {}),
    sourceFileSha256: sha256(sourceFile), styleSha256: sha256(stylePng), maskSha256: sha256(maskPng),
    ...(placementGuidePng ? { placementGuideSha256: sha256(placementGuidePng) } : {}) };
}

/** Extract at the same board coordinates. Never resize, warp, or compensate drift. */
export async function extractWholeSourceContextShipping(raw: Buffer, plan: WholeSourceContextPlan,
  contract: SourceNeighborContract, child: PatchRectangle): Promise<Buffer> {
  assertWholeSourceContextPlan(plan, contract, child);
  await pngShape(raw, plan.provider.width, plan.provider.height, "provider output");
  return sharp(raw, { limitInputPixels: MAX_PIXELS }).extract(plan.shippingInProvider).png().toBuffer();
}
