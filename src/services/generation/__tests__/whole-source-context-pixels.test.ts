import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { SOURCE_PLACEMENT_RELEASE } from "../../../../content/adventures/source-placement-release";
import { prepareWholeSourceContextPixels, extractWholeSourceContextShipping } from "../whole-source-context-pixels";
import { composeBoundedLocalPatch } from "../local-patch-seam";

const entry = SOURCE_PLACEMENT_RELEASE.inventory.find(e => e.hideId === "greatwall-v12-2")!;
const contract = entry.sourceNeighbors!.contract, child = entry.effective.child;
let sourceFile: Buffer, mask: Buffer, guide: Buffer;
const rgba = async (b: Buffer) => sharp(b).ensureAlpha().raw().toBuffer();
const input = () => ({ sourceFile, contract, child, originalMaskPng: mask, originalGuidePng: guide });

beforeAll(async () => {
  sourceFile = await readFile(contract.source.art);
  const pixels = Buffer.alloc(512 * 768 * 4, 255);
  for (let y = child.top; y < child.top + child.height; y++)
    for (let x = child.left; x < child.left + child.width; x++) pixels[(y * 512 + x) * 4 + 3] = 0;
  mask = await sharp(pixels, { raw: { width: 512, height: 768, channels: 4 } }).png().toBuffer();
  guide = await sharp(sourceFile).extract(contract.crop).composite([{ input: Buffer.from(
    '<svg width="512" height="768"><rect x="108" y="208" width="256" height="350" fill="none" stroke="cyan" stroke-width="3"/></svg>') }]).png().toBuffer();
});

describe("native source context pixels without a provider purchase", () => {
  it("preserves every native source, mask and guide pixel and protects the added context", async () => {
    const p = await prepareWholeSourceContextPixels(input());
    expect((await rgba(p.stylePng)).equals(await sharp(sourceFile).extract(p.plan.provider).ensureAlpha().raw().toBuffer())).toBe(true);
    expect(await sharp(p.maskPng).metadata()).toMatchObject({ width: 768, height: 1024, hasAlpha: true });
    expect((await sharp(p.maskPng).extract(p.plan.shippingInProvider).ensureAlpha().raw().toBuffer()).equals(await rgba(mask))).toBe(true);
    expect((await sharp(p.placementGuidePng!).extract(p.plan.shippingInProvider).ensureAlpha().raw().toBuffer()).equals(await rgba(guide))).toBe(true);
    const raw = await rgba(p.maskPng), r = p.plan.shippingInProvider;
    let unexpectedEditablePixels = 0;
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 768; x++) {
      if ((x < r.left || x >= r.left + r.width || y < r.top || y >= r.top + r.height)
        && raw[(y * 768 + x) * 4 + 3] !== 255) unexpectedEditablePixels++;
    }
    expect(unexpectedEditablePixels).toBe(0);
    const shipping = await extractWholeSourceContextShipping(p.stylePng, p.plan, contract, child);
    expect((await rgba(shipping)).equals(await sharp(sourceFile).extract(contract.crop).ensureAlpha().raw().toBuffer())).toBe(true);
  });
  it("refuses mismatched source, mask, guide, old output dimensions and changed mappings for free", async () => {
    const p = await prepareWholeSourceContextPixels(input()), alteredSource = Buffer.from(sourceFile);
    alteredSource[alteredSource.length - 1] = alteredSource[alteredSource.length - 1]! ^ 1;
    await expect(prepareWholeSourceContextPixels({ ...input(), sourceFile: alteredSource })).rejects.toThrow("source hash changed");
    await expect(prepareWholeSourceContextPixels({ ...input(), originalMaskPng: p.maskPng })).rejects.toThrow("different native raster");
    await expect(prepareWholeSourceContextPixels({ ...input(), originalGuidePng: p.stylePng })).rejects.toThrow("different native raster");
    const oldProviderShape = await sharp({ create: { width: 768, height: 1152, channels: 4, background: "white" } }).png().toBuffer();
    await expect(extractWholeSourceContextShipping(oldProviderShape, p.plan, contract, child)).rejects.toThrow("different native raster");
    await expect(extractWholeSourceContextShipping(p.stylePng,
      { ...p.plan, shippingInProvider: { ...p.plan.shippingInProvider, left: 0 } }, contract, child)).rejects.toThrow("pinned native mapping changed");
  });
  it("keeps the existing strict seam refusal for a provider that shifts the scene", async () => {
    const p = await prepareWholeSourceContextPixels(input());
    const shiftedRaw = await sharp(sourceFile).extract({ ...p.plan.provider, left: p.plan.provider.left + 3 }).png().toBuffer();
    const shipping = await extractWholeSourceContextShipping(shiftedRaw, p.plan, contract, child);
    const originalBoard = await sharp(sourceFile).png().toBuffer();
    const joined = await composeBoundedLocalPatch(originalBoard, contract.crop, shipping, child,
      { requireAligned: true, returnRect: contract.returnRect });
    expect(joined.usable).toBe(false);
    expect(joined.report.verdict).toBe("misaligned");
  });
});
