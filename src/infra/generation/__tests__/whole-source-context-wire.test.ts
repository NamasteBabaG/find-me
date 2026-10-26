import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SOURCE_PLACEMENT_RELEASE } from "../../../../content/adventures/source-placement-release";
import { localPatchBoardForVersion } from "../../../domain/scene/local-patch-catalog";
import { WHOLE_SOURCE_CONTEXT_VERSION } from "../../../domain/scene/whole-source-context";
import { prepareWholeSourceContextPixels } from "../../../services/generation/whole-source-context-pixels";
import { wholeSourceContextPrompt } from "../../../services/generation/whole-source-context-prompt";
import { guidedFrameOverlay } from "../../../domain/generation/guided-frame-recovery";
import { poseMask } from "../../../services/generation/local-patch-render";
import { buyLocalPatch, LOCAL_PATCH_LOW_IMAGE_POLICY, LOCAL_PATCH_IMAGE_POLICY, LOCAL_PATCH_MINI_IMAGE_POLICY,
  localPatchRenderPolicySha256, wholeSourceContextImagePolicy, LOCAL_PATCH_PHOTO_REFERENCE_MODE } from "../openai-local-patch";

const entry = SOURCE_PLACEMENT_RELEASE.inventory.find(e => e.hideId === "greatwall-v12-2")!;
const contract = entry.sourceNeighbors!.contract, child = entry.effective.child;
const board = localPatchBoardForVersion("greatwall", 12)!, hide = board.hides.find(h => h.id === entry.hideId)!;
let pixels: Awaited<ReturnType<typeof prepareWholeSourceContextPixels>>, portrait: Buffer;
beforeAll(async () => {
  const sourceFile = await readFile(contract.source.art), original = await sharp(sourceFile).extract(contract.crop).png().toBuffer();
  const mask = await poseMask({ ...hide, mask: contract.returnRect });
  const guide = await sharp(original).composite([{ input: Buffer.from(guidedFrameOverlay(child, contract.returnRect)) }]).png().toBuffer();
  pixels = await prepareWholeSourceContextPixels({ sourceFile, contract, child, originalMaskPng: mask, originalGuidePng: guide });
  portrait = await sharp({ create: { width: 128, height: 160, channels: 4, background: "#bd9777" } }).png().toBuffer();
});
const input = (quality: "low" | "medium" = "low") => ({ worldId: "synthetic-context-world:board-wizard", requestKey: "greatwall-v12-2:peeking:render:4",
  prompt: wholeSourceContextPrompt({ plan: pixels.plan, hide, ground: board.ground, ageYears: 7, wardrobe: "blue jacket", subjectDirection: "Follow the child's enrolled natural hair and age-seven body plan." }),
  stylePng: pixels.stylePng, maskPng: pixels.maskPng, identityPng: portrait, subjectPhotoPng: portrait,
  referenceMode: LOCAL_PATCH_PHOTO_REFERENCE_MODE, subjectQuality: quality,
  placementGuideVersion: WHOLE_SOURCE_CONTEXT_VERSION, placementGuidePng: pixels.placementGuidePng!,
  wholeSourceContext: { plan: pixels.plan, contract, child } });
const answer = (png: Buffer) => new Response(JSON.stringify({ model: "gpt-image-2", usage: { input_tokens: 30, output_tokens: 196, total_tokens: 226,
  input_tokens_details: { text_tokens: 10, image_tokens: 20 } }, data: [{ b64_json: png.toString("base64") }] }),
  { status: 200, headers: { "x-request-id": "req-context-synthetic" } });

describe("native source context on the actual image adapter, without real network", () => {
  it.each(["low", "medium"] as const)("dispatches one %s image with exact native source, mask and guide and retains the original response", async quality => {
    const fetchOnce = vi.fn<typeof fetch>(async () => answer(pixels.stylePng));
    const base = quality === "low" ? LOCAL_PATCH_LOW_IMAGE_POLICY : LOCAL_PATCH_IMAGE_POLICY;
    const policy = wholeSourceContextImagePolicy(base), result = await buyLocalPatch("synthetic-never-live", input(quality), { policy, fetchOnce });
    expect(fetchOnce).toHaveBeenCalledTimes(1);
    const form = fetchOnce.mock.calls[0]![1]!.body as FormData, images = form.getAll("image[]") as Blob[];
    expect(form.get("model")).toBe("gpt-image-2"); expect(form.get("quality")).toBe(quality); expect(form.get("size")).toBe("768x1024"); expect(form.get("n")).toBe("1");
    expect(images).toHaveLength(4);
    for (const [i, expected] of [pixels.stylePng, portrait, portrait, pixels.placementGuidePng!].entries())
      expect(Buffer.from(await images[i]!.arrayBuffer()).equals(expected)).toBe(true);
    expect(Buffer.from(await (form.get("mask") as Blob).arrayBuffer()).equals(pixels.maskPng)).toBe(true);
    expect(result.png?.equals(pixels.stylePng)).toBe(true); expect(result.evidence?.amountMicroUsd).toBeGreaterThan(0);
    expect(result.rejected).toBeNull(); expect(policy.reserveMicroUsd).toBe(150000);
    expect(localPatchRenderPolicySha256(policy)).not.toBe(localPatchRenderPolicySha256(base));
    expect(base.size).toBe("768x1152"); expect(base.quality).toBe(quality);
  });
  it("rejects wrong mappings, old reference shape, unbound new canvas and policy upgrades before dispatch", async () => {
    const fetchOnce = vi.fn<typeof fetch>(async () => { throw Error("Must not dispatch"); });
    const policy = wholeSourceContextImagePolicy(LOCAL_PATCH_LOW_IMAGE_POLICY), request = input();
    const changed = structuredClone(request.wholeSourceContext); changed.plan.shippingInProvider.left++;
    await expect(buyLocalPatch("synthetic", { ...request, wholeSourceContext: changed }, { policy, fetchOnce })).rejects.toThrow("mapping changed");
    const originalShape = await sharp(pixels.stylePng).extract(pixels.plan.shippingInProvider).png().toBuffer();
    await expect(buyLocalPatch("synthetic", { ...request, stylePng: originalShape }, { policy, fetchOnce })).rejects.toThrow("native source, mask and guide");
    await expect(buyLocalPatch("synthetic", { ...request, wholeSourceContext: undefined }, { policy, fetchOnce })).rejects.toThrow("exact source mapping");
    await expect(buyLocalPatch("synthetic", request, { policy: LOCAL_PATCH_LOW_IMAGE_POLICY, fetchOnce })).rejects.toThrow("native output");
    await expect(buyLocalPatch("synthetic", request, { policy: wholeSourceContextImagePolicy(LOCAL_PATCH_IMAGE_POLICY), fetchOnce })).rejects.toThrow();
    expect(() => wholeSourceContextImagePolicy(LOCAL_PATCH_MINI_IMAGE_POLICY)).toThrow("original image policy");
    expect(fetchOnce).not.toHaveBeenCalled();
  });
  it("gives one coordinate authority and a complete age, crown, neighbor and source-preservation contract", () => {
    const prompt = input().prompt;
    expect(prompt).toContain("opaque 768x1024 PNG"); expect(prompt).toContain(JSON.stringify(pixels.plan.providerReturn));
    expect(prompt).toContain(JSON.stringify(pixels.plan.shippingInProvider)); expect(prompt).toContain("complete new child's visible crown");
    expect(prompt).toContain("never resize, crop, translate, reframe"); expect(prompt).toContain("never the guide");
    expect(prompt).not.toContain("original 512x768 crop"); expect(prompt).not.toContain("768x1152");
    for (const head of pixels.plan.providerHeads) expect(prompt).toContain(head.sourceId);
  });
});
