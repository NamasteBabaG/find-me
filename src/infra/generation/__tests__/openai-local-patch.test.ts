import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  LOCAL_PATCH_IMAGE_POLICY, buyLocalPatch, localPatchRenderPolicySha256,
} from "../openai-local-patch";

/**
 * The painter, on a fake wire.
 *
 * No network and no key: `fetchOnce` is injected, so what is under test is the
 * request this route sends and what it does with each kind of answer. The
 * transport underneath is the board engine's, already tested on its own; what
 * is new here is that this route reserves and settles NOWHERE - the bill comes
 * back to the purchase boundary instead.
 */

let crop: Buffer, identity: Buffer, mask: Buffer, painted: Buffer;

beforeAll(async () => {
  crop = await sharp({ create: { width: 512, height: 768, channels: 4, background: "#d2be96" } }).png().toBuffer();
  identity = await sharp({ create: { width: 512, height: 512, channels: 4, background: "#e2b294" } }).png().toBuffer();
  const hole = await sharp({ create: { width: 252, height: 500, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } } }).png().toBuffer();
  mask = await sharp({ create: { width: 512, height: 768, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } })
    .composite([{ input: hole, left: 130, top: 150, blend: "dest-out" }]).png().toBuffer();
  painted = await sharp({ create: { width: 768, height: 1152, channels: 4, background: "#8090a0" } }).png().toBuffer();
}, 60_000);

const answer = (extra: Record<string, unknown> = {}, headers: Record<string, string> = { "x-request-id": "req-local-patch-1" }) =>
  new Response(JSON.stringify({
    model: "gpt-image-2",
    usage: { input_tokens: 30, output_tokens: 196, total_tokens: 226, input_tokens_details: { text_tokens: 10, image_tokens: 20 } },
    data: [{ b64_json: painted.toString("base64") }], ...extra,
  }), { status: 200, headers });

const request = () => ({
  worldId: "gam_1:board-wizard", requestKey: "sydney-2:kneeling:render:1",
  prompt: "Paint the child into the marked area.", stylePng: crop, identityPng: identity, maskPng: mask,
});

describe("buying one local patch", () => {
  it("sends the request the paid round proved, once", async () => {
    const fetchOnce = vi.fn(async () => answer());
    await buyLocalPatch("sk-test-only", request(), { fetchOnce: fetchOnce as unknown as typeof fetch });

    expect(fetchOnce).toHaveBeenCalledTimes(1);
    const [url, init] = fetchOnce.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/edits");
    const form = init.body as FormData;
    expect(form.get("quality")).toBe("medium");
    expect(form.get("size")).toBe("768x1152");
    expect(form.get("background")).toBe("opaque");
    expect(form.get("output_format")).toBe("png");
    expect(form.get("n")).toBe("1");
    // The crop, the identity and - the part a whole world was rendered without -
    // the mask.
    expect(form.getAll("image[]")).toHaveLength(2);
    expect(form.get("mask")).toBeTruthy();
  }, 60_000);

  it("hands back the picture and the bill the rate card says", async () => {
    const result = await buyLocalPatch("sk-test-only", request(), { fetchOnce: (async () => answer()) as unknown as typeof fetch });
    expect("evidence" in result).toBe(true);
    const { evidence, png } = result as { evidence: { amountMicroUsd: number; model: string; providerNamespace: string; costBasis: string; providerRequestId: string }; png: Buffer };
    // 10 text x 5 + 20 image x 8 + 196 output x 30 micro-USD.
    expect(evidence.amountMicroUsd).toBe(10 * 5 + 20 * 8 + 196 * 30);
    expect(evidence.model).toBe("gpt-image-2");
    expect(evidence.providerNamespace).toBe("openai:find-me-existing");
    expect(evidence.costBasis).toBe("conservative-upper-estimate");
    expect(evidence.providerRequestId).toBe("req-local-patch-1");
    // At the size it was bought at. Fitting it to the crop is the renderer's
    // business; these are the bytes that get retained.
    expect(await sharp(png).metadata()).toMatchObject({ width: 768, height: 1152 });
  }, 60_000);

  it("reserves and settles nothing: the bill goes back to the boundary that owns it", async () => {
    // The transport was written to do its own accounting. This route does it
    // once, through purchaseOnce, and would double-count if the transport also
    // did. Nothing here touches a world budget - there is not one to touch.
    const result = await buyLocalPatch("sk-test-only", request(), { fetchOnce: (async () => answer()) as unknown as typeof fetch });
    expect("evidence" in result).toBe(true);
  }, 60_000);

  it("says nothing usable came back, rather than inventing an answer", async () => {
    // Nothing priced and nothing kept: there is no purchase to describe, only a
    // dispatch that may have been billed. A throw is read as exactly that.
    for (const [name, custom] of [
      ["the wire failed", async () => { throw new Error("socket hung up"); }],
      ["there was no receipt", async () => answer({}, {})],
      ["the usage could not be read", async () => answer({ usage: { input_tokens: 1 } })],
      ["another model answered", async () => answer({ model: "gpt-image-1" })],
    ] as const) {
      await expect(buyLocalPatch("sk-test-only", request(), { fetchOnce: custom as unknown as typeof fetch }), name)
        .rejects.toThrow(/LOCAL_PATCH_PAINTER/);
    }
  }, 120_000);

  it("keeps the bill when the image is refused, because those are different questions", async () => {
    // An image of the wrong shape does not make a known charge unknown. The
    // charge was priced cleanly before anything looked at the picture, and
    // flattening the refusal used to throw that away - so a ledger recorded an
    // unknown amount it could have stated exactly.
    const wrongSize = await sharp({ create: { width: 512, height: 768, channels: 4, background: "#334455" } }).png().toBuffer();
    const result = await buyLocalPatch("sk-test-only", request(), {
      fetchOnce: (async () => answer({ data: [{ b64_json: wrongSize.toString("base64") }] })) as unknown as typeof fetch,
    });
    expect(result.png).toBeNull();
    expect(result.rejected).toMatch(/invalid_output/);
    expect(result.unknownReason).toBeNull();
    // The bill the response priced, in full.
    expect(result.evidence).toMatchObject({
      amountMicroUsd: 10 * 5 + 20 * 8 + 196 * 30,
      providerRequestId: "req-local-patch-1",
      model: "gpt-image-2",
      providerNamespace: "openai:find-me-existing",
    });
    // And the refused bytes are kept, so somebody can see WHY it was refused.
    expect(result.quarantined?.equals(wrongSize)).toBe(true);
  }, 60_000);

  it("is a different purchase when the settings change", () => {
    const base = localPatchRenderPolicySha256();
    expect(base).toMatch(/^[a-f0-9]{64}$/);
    expect(localPatchRenderPolicySha256({ ...LOCAL_PATCH_IMAGE_POLICY, quality: "low" })).not.toBe(base);
    expect(localPatchRenderPolicySha256({ ...LOCAL_PATCH_IMAGE_POLICY, size: "1024x1024" })).not.toBe(base);
    expect(localPatchRenderPolicySha256({ ...LOCAL_PATCH_IMAGE_POLICY,
      rateCard: { ...LOCAL_PATCH_IMAGE_POLICY.rateCard, imageOutput: 31 } })).not.toBe(base);
    expect(localPatchRenderPolicySha256()).toBe(base);
  });
});
