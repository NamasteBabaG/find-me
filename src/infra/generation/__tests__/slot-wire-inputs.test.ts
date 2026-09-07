import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { OpenAiAvatarProvider, prepareSlotEdit } from "../openai";
import { slotOf } from "@/services/generation/authoring";
import { paintMask } from "@/services/generation/patch";

describe("fixed-slot qualification uses production wire inputs", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("keeps API alpha transparent INSIDE the paint mask and opaque outside", async () => {
    const c = slotOf("paris", "carousel", "A", { ageYears: 8, outputPx: 1024 });
    const crop = await sharp({ create: { width: c.ctx.rect.w, height: c.ctx.rect.h, channels: 3, background: "#ffbb33" } }).png().toBuffer();
    const wire = await prepareSlotEdit({ crop, paintMask: paintMask(c.ctx, c.art, c.slot), reference: crop, prompt: c.prompt, label: c.name });
    const { data, info } = await sharp(wire.mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(1024);
    expect(info.channels).toBe(4);
    expect(data[(512 * 1024 + 512) * 4 + 3]).toBe(0);
    expect(data[3]).toBe(255);
    expect(wire.promptSent).toContain("Fixed placement for this exact board");
    expect(wire.promptSent).toContain("TOP of the wooden carousel deck");
    // A placement recipe replaces the stale generic target situation, not appends a contradictory pose.
    expect(wire.promptSent).not.toContain("Situation:");
  });
  it("sends the transparent mask and GPT Image 2 to the actual HTTP boundary", async () => {
    const crop = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ffbb33" } }).png().toBuffer();
    const paint = await sharp({ create: { width: 64, height: 64, channels: 3, background: "white" } }).png().toBuffer();
    const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) => {
      const form = init.body as FormData;
      expect(form.get("model")).toBe("gpt-image-2");
      expect(form.get("quality")).toBe("high");
      expect(form.getAll("image[]")).toHaveLength(2);
      const mask = Buffer.from(await (form.get("mask") as Blob).arrayBuffer());
      const alpha = await sharp(mask).extractChannel("alpha").raw().toBuffer();
      expect(alpha.every(value => value === 0)).toBe(true);
      return Response.json({ data: [{ b64_json: crop.toString("base64") }], usage: { output_tokens: 1 } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAiAvatarProvider("test-key", { tries: 1 });
    const result = await provider.editSlotCrop({ crop, paintMask: paint, reference: crop, prompt: "test", label: "wire-test", quality: "high" });
    expect(result.model).toBe("gpt-image-2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not silently buy a different model after access is denied", async () => {
    const crop = await sharp({ create: { width: 64, height: 64, channels: 3, background: "white" } }).png().toBuffer();
    const fetchMock = vi.fn(async () => Response.json({ error: { message: "Model access denied" } }, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAiAvatarProvider("test-key", { tries: 3 });
    await expect(provider.editSlotCrop({ crop, paintMask: crop, reference: crop, prompt: "test", label: "wire-test" })).rejects.toThrow("Model access denied");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
