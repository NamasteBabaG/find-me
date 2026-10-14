export type VisualReviewEffort = "medium" | "high";
export type VisualReviewRole = "scene-quality" | "head-continuity";
/** Which model answers a role. Each role has its standing judge: Opus for quality,
 * Sol for continuity. Sol answering the quality role is an explicit, separately
 * versioned choice (cost experiment E1, docs/CLAUDE_COST_EXPERIMENTS_PLAN_20261014.md)
 * that nothing selects by default. */
export type VisualReviewJudge = "claude-opus-5-5" | "gpt-6.1-sol";
export const VISUAL_REVIEW_PRICING_VERSION = "visual-review-standard-2026-10-08" as const;
export const VISUAL_REVIEW_DEFAULT_EFFORT: VisualReviewEffort = "high";

/** Explicit prospective policy. Historical questions/receipts keep their model. */
export function visualReviewPolicy(role: VisualReviewRole, effort: VisualReviewEffort = VISUAL_REVIEW_DEFAULT_EFFORT, judge?: VisualReviewJudge) {
  if (!["scene-quality", "head-continuity"].includes(role) || !["medium", "high"].includes(effort))
    throw Error("Unsupported visual review role or effort");
  const standing = role === "scene-quality" ? "claude-opus-5-5" : "gpt-6.1-sol";
  if (judge !== undefined && judge !== standing && !(role === "scene-quality" && judge === "gpt-6.1-sol"))
    throw Error("Unsupported visual review judge");
  // Sol on the quality question keeps the quality question's own output cap,
  // reasoning included: a smaller one would cut answers again.
  if (judge !== undefined && judge !== standing) return Object.freeze({
    version: `visual-review-${role}-sol-${effort}/v1`, role, effort,
    provider: "openai" as const, model: "gpt-6.1-sol" as const,
    endpoint: "https://api.openai.com/v1/chat/completions",
    maxOutputTokens: 6500, timeoutMs: 240_000, pricingVersion: VISUAL_REVIEW_PRICING_VERSION,
  });
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
