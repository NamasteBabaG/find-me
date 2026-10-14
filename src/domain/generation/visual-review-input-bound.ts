/**
 * The most input tokens one visual-review request can be billed for, computed
 * from the exact request before anything is reserved: its model, the image
 * detail its transport sends, the prompt, each image's adjacent label, and
 * every image's pixel size. A request this cannot bound is refused, never
 * estimated.
 *
 * Text: every text token covers at least one UTF-8 byte, so text costs at most
 * its byte length.
 *
 * Images, by each provider's published rule (checked 2026-10-14):
 * - Claude, high-resolution tier (Claude 4.7 and later, so Opus 5.5): an image
 *   costs ⌈w/28⌉ × ⌈h/28⌉ visual tokens. One beyond 2,576 px or 4,784 tokens is
 *   downscaled first, so it never costs more than 4,784.
 *   https://platform.claude.com/docs/en/build-with-claude/vision
 * - OpenAI's patch rule at detail "high": ⌈w/32⌉ × ⌈h/32⌉ patches, scaled down to
 *   at most 2,500, times the model's multiplier, rounded up. The guide lists
 *   gpt-5.6-sol and gpt-6-astra at 1.2. It does not list gpt-6.1-sol, so treating
 *   gpt-6.1-sol like its family is an assumption, checked against its bills.
 *   https://developers.openai.com/api/docs/guides/images-vision
 *
 * Framing (the role and block markers around the content) is not published. A
 * fixed allowance per request and per content block covers it.
 *
 * The first full v19/v3 QA world (14 October) agrees: its billed input rose
 * 1.006 tokens per Opus image token and 1.017 per Sol image token under these
 * rules, and no bill reached 70% of its bound.
 */
export const VISUAL_REVIEW_INPUT_BOUND_VERSION = "visual-review-input-bound/v1" as const;
/** Unpublished role and block markers: a fixed allowance per request and per content block. */
export const VISUAL_REVIEW_FRAMING_TOKENS = Object.freeze({ request: 256, block: 8 });
/** Larger images are rejected by Claude, and we never send one: refused as a shape. */
const MAX_IMAGE_SIDE = 8_000;

type ImageRule = { readonly kind: "claude-28px" } | { readonly kind: "openai-patch-high"; readonly multiplierTenths: number };
/** Only what the product sends. Another model or provider has no rule here and is refused. */
const RULES: Readonly<Record<string, ImageRule>> = Object.freeze({
  "anthropic:claude-opus-5-5": { kind: "claude-28px" },
  "openai:gpt-6.1-sol": { kind: "openai-patch-high", multiplierTenths: 12 },
});

/** Width and height from a PNG's IHDR chunk; null for anything that is not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], ihdr = [0x49, 0x48, 0x44, 0x52];
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b) || ihdr.some((b, i) => bytes[12 + i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}
export const claudeImageTokens = (width: number, height: number) =>
  Math.min(Math.ceil(width / 28) * Math.ceil(height / 28), 4_784);
export const openAiPatchImageTokens = (width: number, height: number, multiplierTenths = 12) =>
  Math.ceil(Math.min(Math.ceil(width / 32) * Math.ceil(height / 32), 2_500) * multiplierTenths / 10);

export type VisualReviewWire = {
  readonly provider: string; readonly model: string;
  /** The `detail` the transport sends with every image; null where the provider has none. */
  readonly detail: string | null;
  readonly prompt: string; readonly labels: readonly string[]; readonly images: readonly Uint8Array[];
};
export type VisualReviewInputBound =
  | { readonly ok: true; readonly inputTokens: number; readonly imageTokens: number; readonly textBytes: number; readonly framingTokens: number }
  | { readonly ok: false; readonly reason: string };

export function visualReviewInputBound(wire: VisualReviewWire): VisualReviewInputBound {
  const rule = RULES[`${wire.provider}:${wire.model}`];
  if (!rule) return { ok: false, reason: `No published image-token rule covers ${wire.provider} ${wire.model}` };
  if (rule.kind === "claude-28px" ? wire.detail !== null : wire.detail !== "high")
    return { ok: false, reason: `${wire.model} images are bounded only at the detail the product sends, not ${wire.detail ?? "none"}` };
  if (!wire.images.length || wire.labels.length !== wire.images.length) return { ok: false, reason: "Every image needs exactly one adjacent label" };
  let imageTokens = 0;
  for (const [index, bytes] of wire.images.entries()) {
    const size = pngSize(bytes);
    if (!size) return { ok: false, reason: `Image ${index + 1} is not a PNG` };
    if (size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE) return { ok: false, reason: `Image ${index + 1} is ${size.width}x${size.height} px, beyond ${MAX_IMAGE_SIDE} px` };
    imageTokens += rule.kind === "claude-28px" ? claudeImageTokens(size.width, size.height)
      : openAiPatchImageTokens(size.width, size.height, rule.multiplierTenths);
  }
  const utf8 = new TextEncoder(), textBytes = [wire.prompt, ...wire.labels].reduce((n, text) => n + utf8.encode(text).length, 0);
  // One prompt block, then a label block and an image block per image.
  const framingTokens = VISUAL_REVIEW_FRAMING_TOKENS.request + VISUAL_REVIEW_FRAMING_TOKENS.block * (1 + 2 * wire.images.length);
  return { ok: true, inputTokens: imageTokens + textBytes + framingTokens, imageTokens, textBytes, framingTokens };
}
