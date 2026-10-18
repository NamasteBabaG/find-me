export type VisualReviewEffort = "medium" | "high";
export type VisualReviewRole = "scene-quality" | "head-continuity";
/** Which model answers a role. Each role has its standing judge: Opus for quality,
 * Sol for continuity. Sol answering the quality role is an explicit, separately
 * versioned choice (cost experiment E1, docs/CLAUDE_COST_EXPERIMENTS_PLAN_20261014.md)
 * that nothing selects by default. */
export type VisualReviewJudge = "claude-opus-5-5" | "gpt-6.1-sol";
/** How a question reaches its provider. Absent: one synchronous request, as every
 * historical question. `responses-background` (Sol continuity only) is asked once
 * with `background: true` and polled by its response id across worker slices; it is
 * a different operation with its own policy version, so it never replays a
 * synchronous receipt and a synchronous question never replays it. */
export type VisualReviewTransport = "responses-background";
export const VISUAL_REVIEW_PRICING_VERSION = "visual-review-standard-2026-10-08" as const;
export const VISUAL_REVIEW_DEFAULT_EFFORT: VisualReviewEffort = "high";
export const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses" as const;

/** Explicit prospective policy. Historical questions/receipts keep their model. */
export function visualReviewPolicy(role: VisualReviewRole, effort: VisualReviewEffort = VISUAL_REVIEW_DEFAULT_EFFORT, judge?: VisualReviewJudge,
  transport?: VisualReviewTransport) {
  if (!["scene-quality", "head-continuity"].includes(role) || !["medium", "high"].includes(effort))
    throw Error("Unsupported visual review role or effort");
  const standing = role === "scene-quality" ? "claude-opus-5-5" : "gpt-6.1-sol";
  if (judge !== undefined && judge !== standing && !(role === "scene-quality" && judge === "gpt-6.1-sol"))
    throw Error("Unsupported visual review judge");
  if (transport !== undefined) {
    if (transport !== "responses-background" || role !== "head-continuity" || (judge !== undefined && judge !== "gpt-6.1-sol"))
      throw Error("Only the Sol continuity question has a background transport");
    // The synchronous continuity question's model, effort, output cap and rate card.
    return Object.freeze({
      version: `visual-review-${role}-${effort}-background/v1`, role, effort,
      provider: "openai" as const, model: "gpt-6.1-sol" as const,
      endpoint: OPENAI_RESPONSES_ENDPOINT,
      maxOutputTokens: 4096, timeoutMs: 240_000, pricingVersion: VISUAL_REVIEW_PRICING_VERSION,
    });
  }
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
/** Whether a policy is asked in the background and polled, never sent synchronously. */
export const isBackgroundReviewPolicy = (policy: Pick<VisualReviewPolicy, "endpoint">) => policy.endpoint === OPENAI_RESPONSES_ENDPOINT;
