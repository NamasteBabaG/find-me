import type { VisualReviewPolicy } from "../../domain/generation/visual-review-policy";

const whole = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const unknown = () => ({ costCents: 0, costUnknown: true });
/** Standard global rates checked 2026-10-08. All reasoning is in output usage.
 * MED/HIGH change token consumption, not the rate card. No historical repricing.
 * https://developers.openai.com/api/docs/models/gpt-6.1-sol
 * https://platform.claude.com/docs/en/models/opus-5-5/overview */
export function visualReviewCharge(policy: VisualReviewPolicy, model: string | null, usage: Record<string, unknown> | null) {
  if (model !== policy.model || !usage || policy.pricingVersion !== "visual-review-standard-2026-10-08") return unknown();
  if (policy.provider === "openai" && model === "gpt-6.1-sol") {
    const input = usage.prompt_tokens, output = usage.completion_tokens;
    if (usage.prompt_tokens_details != null && !record(usage.prompt_tokens_details)) return unknown();
    const details = usage.prompt_tokens_details as Record<string, unknown> | undefined;
    const cached = details?.cached_tokens ?? 0, writes = details?.cache_write_tokens ?? 0;
    if (!whole(input) || !whole(output) || !whole(cached) || !whole(writes) || cached + writes > input || input > 272_000) return unknown();
    const ordinaryRate = details && "cache_write_tokens" in details ? 200 : 250;
    const total = (input - cached - writes) * ordinaryRate + cached * 10 + writes * 250 + output * 1000;
    if (!Number.isSafeInteger(total)) return unknown();
    return { costCents: total / 1_000_000, costUnknown: false };
  }
  if (policy.provider === "anthropic" && model === "claude-opus-5-5") {
    const input = usage.input_tokens, output = usage.output_tokens;
    const cache = usage.cache_creation_input_tokens ?? 0, reads = usage.cache_read_input_tokens ?? 0;
    if (usage.cache_creation != null && !record(usage.cache_creation)) return unknown();
    const tiers = usage.cache_creation as Record<string, unknown> | undefined;
    const short = tiers?.ephemeral_5m_input_tokens, long = tiers?.ephemeral_1h_input_tokens;
    if (!whole(input) || !whole(output) || !whole(cache) || !whole(reads)
      || (usage.service_tier != null && usage.service_tier !== "standard")
      || (usage.inference_geo != null && usage.inference_geo !== "global")
      || (tiers && (!whole(short) || !whole(long) || short + long !== cache))
      || (usage.server_tool_use != null && (!record(usage.server_tool_use)
        || Object.values(usage.server_tool_use).some(n => n !== 0)))) return unknown();
    // Anthropic cache counters are additive to ordinary input. Unknown cache
    // duration is conservatively charged at the 1h rate, never subtracted twice.
    const cacheCents = tiers ? (short as number) * 500 + (long as number) * 800 : cache * 800;
    const total = input * 400 + reads * 20 + cacheCents + output * 2000;
    if (!Number.isSafeInteger(total)) return unknown();
    return { costCents: total / 1_000_000, costUnknown: false };
  }
  return unknown();
}

/**
 * An Opus answer delivered by Anthropic's Message Batches, priced by the tier its
 * own usage says served it. "All usage is charged at 50% of the standard API
 * prices" (platform.claude.com, batch processing, checked 2026-10-16): every rate
 * above halves exactly. "standard" is priced at the standard card; any other
 * tier, or none, is not priced: the standard card is no upper bound for a tier
 * nobody has a card for.
 */
export function visualReviewBatchCharge(policy: VisualReviewPolicy, model: string | null, usage: Record<string, unknown> | null) {
  if (policy.provider !== "anthropic" || !usage) return unknown();
  if (usage.service_tier === "standard") return visualReviewCharge(policy, model, usage);
  if (usage.service_tier !== "batch") return unknown();
  const standard = visualReviewCharge(policy, model, { ...usage, service_tier: "standard" });
  if (standard.costUnknown) return standard;
  // Every standard rate is even, so half of the integer total is exact.
  const total = Math.round(standard.costCents * 1_000_000);
  if (!Number.isSafeInteger(total) || total % 2) return unknown();
  return { costCents: total / 2 / 1_000_000, costUnknown: false };
}
