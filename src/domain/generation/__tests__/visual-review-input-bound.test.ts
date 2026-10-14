import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { claudeImageTokens, openAiPatchImageTokens, pngSize, visualReviewInputBound, VISUAL_REVIEW_FRAMING_TOKENS,
  type VisualReviewWire } from "../visual-review-input-bound";

const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "white" } }).png().toBuffer();

describe("the input bound of one visual review request", () => {
  it("prices Claude images exactly as the published high-resolution table does", () => {
    // platform.claude.com/docs/en/build-with-claude/vision, "Resolution and token cost", high-resolution tier.
    const table = [[200, 200, 64], [1000, 1000, 1296], [1092, 1092, 1521], [1920, 1080, 2691], [2000, 1500, 3888], [3840, 2160, 4784]] as const;
    for (const [width, height, tokens] of table) expect(claudeImageTokens(width, height)).toBe(tokens);
  });

  it("prices OpenAI images by 32 px patches at detail high: at most 2,500 patches, 1.2 tokens each, rounded up", () => {
    expect(openAiPatchImageTokens(33, 33)).toBe(5); // 2 x 2 patches = 4.8 tokens
    expect(openAiPatchImageTokens(896, 1152)).toBe(1210); // 28 x 36 = 1,008 patches = 1,209.6
    expect(openAiPatchImageTokens(1600, 1600)).toBe(3000); // exactly 2,500 patches
    expect(openAiPatchImageTokens(4096, 4096)).toBe(3000); // scaled down to 2,500 patches
  });

  it("reads PNG dimensions from the header and nothing else as a PNG", async () => {
    expect(pngSize(await png(1432, 1152))).toEqual({ width: 1432, height: 1152 });
    expect(pngSize(Buffer.from("GIF89a, then twenty bytes or so"))).toBeNull();
    expect(pngSize(new Uint8Array(8))).toBeNull();
  });

  it("counts text as its UTF-8 bytes and adds the framing allowance for every block", async () => {
    const bound = visualReviewInputBound({ provider: "anthropic", model: "claude-opus-5-5", detail: null,
      prompt: "שלום", labels: ["é", "ab"], images: [await png(28, 28), await png(29, 28)] });
    // Hebrew letters are two bytes each; images are 1 and 2 patches; five blocks: the prompt, then a label and an image twice.
    const framing = VISUAL_REVIEW_FRAMING_TOKENS.request + 5 * VISUAL_REVIEW_FRAMING_TOKENS.block;
    expect(bound).toEqual({ ok: true, imageTokens: 3, textBytes: 8 + 2 + 2, framingTokens: framing, inputTokens: 3 + 12 + framing });
  });

  it("prices the same request by each model's own rule", async () => {
    const images = [await png(896, 1152)], base = { prompt: "p", labels: ["l"], images };
    const opus = visualReviewInputBound({ ...base, provider: "anthropic", model: "claude-opus-5-5", detail: null });
    const sol = visualReviewInputBound({ ...base, provider: "openai", model: "gpt-6.1-sol", detail: "high" });
    expect([opus.ok && opus.imageTokens, sol.ok && sol.imageTokens]).toEqual([32 * 42, 1210]);
  });

  it("refuses what it cannot bound instead of estimating it", async () => {
    const wire: VisualReviewWire = { provider: "anthropic", model: "claude-opus-5-5", detail: null, prompt: "p", labels: ["l"], images: [await png(64, 64)] };
    expect(visualReviewInputBound(wire).ok).toBe(true);
    const refusals: [Partial<VisualReviewWire>, RegExp][] = [
      [{ model: "claude-opus-4-1" }, /No published image-token rule covers anthropic claude-opus-4-1/],
      [{ provider: "openai", model: "gpt-5.6-sol", detail: "high" }, /No published image-token rule/],
      [{ provider: "openai", model: "gpt-6.1-sol", detail: "original" }, /not original/],
      [{ provider: "openai", model: "gpt-6.1-sol", detail: null }, /not none/],
      [{ detail: "high" }, /not high/],
      [{ images: [Buffer.from("GIF89a, then twenty bytes or so")] }, /Image 1 is not a PNG/],
      [{ images: [await png(8_001, 10)] }, /8001x10 px, beyond 8000 px/],
      [{ labels: [] }, /exactly one adjacent label/],
      [{ images: [], labels: [] }, /exactly one adjacent label/],
    ];
    for (const [change, reason] of refusals) expect(visualReviewInputBound({ ...wire, ...change })).toEqual({ ok: false, reason: expect.stringMatching(reason) });
  });
});
