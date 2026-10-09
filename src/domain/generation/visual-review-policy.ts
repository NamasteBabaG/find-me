export type VisualReviewEffort = "medium" | "high";
export type VisualReviewRole = "scene-quality" | "head-continuity";
export const VISUAL_REVIEW_PRICING_VERSION = "visual-review-standard-2026-10-08" as const;
export const VISUAL_REVIEW_DEFAULT_EFFORT: VisualReviewEffort = "high";

/** Explicit prospective policy. Historical questions/receipts keep their model. */
export function visualReviewPolicy(role: VisualReviewRole, effort: VisualReviewEffort = VISUAL_REVIEW_DEFAULT_EFFORT) {
  if (!["scene-quality", "head-continuity"].includes(role) || !["medium", "high"].includes(effort))
    throw Error("Unsupported visual review role or effort");
  return Object.freeze({
    version: `visual-review-${role}-${effort}/v1`, role, effort,
    provider: role === "scene-quality" ? "anthropic" as const : "openai" as const,
    model: role === "scene-quality" ? "claude-opus-5-5" as const : "gpt-6.1-sol" as const,
    endpoint: role === "scene-quality" ? "https://api.anthropic.com/v1/messages" : "https://api.openai.com/v1/chat/completions",
    maxOutputTokens: role === "scene-quality" ? 6500 : 4096,
    timeoutMs: 240_000,
    pricingVersion: VISUAL_REVIEW_PRICING_VERSION,
  });
}
export type VisualReviewPolicy = ReturnType<typeof visualReviewPolicy>;
