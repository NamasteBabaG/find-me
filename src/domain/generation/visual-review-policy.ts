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
/** The processing tier a lean question asks for (local-patch-lean/v1): Flex at half the
 * standard price, or the default tier its documented refusal falls back to. */
export type VisualReviewTier = "flex" | "default";
export const VISUAL_REVIEW_PRICING_VERSION = "visual-review-standard-2026-10-08" as const;
/** gpt-6.1-sol by the tier that served the answer: Flex at exactly half of the standard
 * card, the default tier at the standard card (developers.openai.com, gpt-6.1-sol, checked
 * 2026-10-15). A reservation is always the standard card: a Flex request may be served
 * at the default tier. */
export const VISUAL_REVIEW_SOL_TIERS_PRICING_VERSION = "visual-review-sol-tiers-2026-10-19" as const;
export const VISUAL_REVIEW_DEFAULT_EFFORT: VisualReviewEffort = "high";
export const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses" as const;

export type VisualReviewPolicy = {
  readonly version: string; readonly role: VisualReviewRole; readonly effort: VisualReviewEffort;
  readonly provider: "anthropic" | "openai"; readonly model: "claude-opus-5-5" | "gpt-6.1-sol";
  readonly endpoint: string; readonly maxOutputTokens: number; readonly timeoutMs: number;
  readonly pricingVersion: typeof VISUAL_REVIEW_PRICING_VERSION | typeof VISUAL_REVIEW_SOL_TIERS_PRICING_VERSION;
  /** Lean questions only; every historical policy has none and asks the default tier. */
  readonly serviceTier?: VisualReviewTier;
};

/** Explicit prospective policy. Historical questions/receipts keep their model. */
export function visualReviewPolicy(role: VisualReviewRole, effort: VisualReviewEffort = VISUAL_REVIEW_DEFAULT_EFFORT, judge?: VisualReviewJudge,
  transport?: VisualReviewTransport, tier?: VisualReviewTier): VisualReviewPolicy {
  if (!["scene-quality", "head-continuity"].includes(role) || !["medium", "high"].includes(effort))
    throw Error("Unsupported visual review role or effort");
  if (tier !== undefined) return leanReviewPolicy(role, tier, effort, judge, transport);
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

/**
 * local-patch-lean/v1: Sol 6.1 HIGH answers both questions of a lean world, each asked once
 * in the background and polled, at the tier named. The quality question (with its subject
 * inspection) keeps room for both readings and its reasoning; the continuity question has
 * twice the historical cap, because a reasoning-only truncation is billed and decides
 * nothing (E3, continuity on R13). No other judge, effort or transport is lean.
 */
export function leanReviewPolicy(role: VisualReviewRole, tier: VisualReviewTier, effort: VisualReviewEffort = "high",
  judge?: VisualReviewJudge, transport: VisualReviewTransport | undefined = "responses-background"): VisualReviewPolicy {
  if (!["scene-quality", "head-continuity"].includes(role) || effort !== "high" || (judge !== undefined && judge !== "gpt-6.1-sol")
    || transport !== "responses-background" || (tier !== "flex" && tier !== "default")) throw Error("Unsupported lean visual review");
  return Object.freeze({
    version: `visual-review-${role}-sol-high-background-${tier}/lean-v1`, role, effort: "high" as const,
    provider: "openai" as const, model: "gpt-6.1-sol" as const, endpoint: OPENAI_RESPONSES_ENDPOINT,
    maxOutputTokens: role === "scene-quality" ? 10_000 : 8_000, timeoutMs: 240_000,
    pricingVersion: VISUAL_REVIEW_SOL_TIERS_PRICING_VERSION, serviceTier: tier,
  });
}
/** Every lean policy, for readers that must recognise one exactly. */
export const LEAN_REVIEW_POLICIES: readonly VisualReviewPolicy[] = Object.freeze((["scene-quality", "head-continuity"] as const)
  .flatMap(role => (["flex", "default"] as const).map(tier => leanReviewPolicy(role, tier))));
export const isLeanReviewPolicy = (policy: Pick<VisualReviewPolicy, "pricingVersion">) => policy.pricingVersion === VISUAL_REVIEW_SOL_TIERS_PRICING_VERSION;
/** The lean policy recorded under this exact version, or null. */
export const leanReviewPolicyOf = (version: string) => LEAN_REVIEW_POLICIES.find(policy => policy.version === version) ?? null;
/** Whether a policy is asked in the background and polled, never sent synchronously. */
export const isBackgroundReviewPolicy = (policy: Pick<VisualReviewPolicy, "endpoint">) => policy.endpoint === OPENAI_RESPONSES_ENDPOINT;
