import { visualReviewPolicy, type VisualReviewEffort, type VisualReviewPolicy } from "../../domain/generation/visual-review-policy";
import { visualReviewCharge } from "./visual-review-pricing";

export type AnthropicVisualReviewReply = {
  raw: string | null; usage: Record<string, unknown> | null; requestId: string | null;
  model: string | null; finishReason: string | null;
  wireFault: "http" | "no-content" | "not-json" | "truncated" | "wrong-model" | "no-receipt" | "timeout" | null;
  costUnknown: boolean;
};
export type AnthropicVisualReviewRequest = {
  prompt: string; images: readonly Buffer[]; imageLabels: readonly string[]; effort: VisualReviewEffort;
  timeoutMs?: number; maxOutputTokens?: number;
};

/**
 * The Messages body of one Opus review, validated. The synchronous route sends it
 * with `service_tier: "standard_only"`; a Message Batches request carries no tier
 * (the batch is its tier) and is otherwise this same body, field for field.
 */
export function anthropicVisualReviewBody(request: Omit<AnthropicVisualReviewRequest, "timeoutMs">, serviceTier: "standard_only" | null) {
  const policy = visualReviewPolicy("scene-quality", request.effort);
  const maximum = request.maxOutputTokens ?? policy.maxOutputTokens;
  if (!request.prompt.trim() || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > policy.maxOutputTokens
    || !request.images.length || request.images.length > 30 || request.images.length !== request.imageLabels.length
    || request.images.some(b => !b.length || b.length > 5 * 1024 * 1024) || request.imageLabels.some(l => !l.trim()))
    throw Error("Invalid Opus visual evidence or output limit");
  return { model: policy.model, max_tokens: maximum, ...(serviceTier ? { service_tier: serviceTier } : {}),
    output_config: { effort: request.effort }, thinking: { type: "adaptive" as const },
    messages: [{ role: "user" as const, content: [{ type: "text" as const, text: request.prompt },
      ...request.images.flatMap((png, i) => [{ type: "text" as const, text: request.imageLabels[i]! },
        { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: png.toString("base64") } }])] }] };
}

/** What one Messages response says, read exactly as the synchronous route reads it.
 * `requestId` is the receipt that came with it; the message id when none did. */
export function readAnthropicVisualReview(policy: VisualReviewPolicy, response: { ok: boolean; requestId: string | null }, body: unknown):
  Omit<AnthropicVisualReviewReply, "costUnknown"> {
  const message = body as { id?: unknown; model?: unknown; content?: { type?: string; text?: string }[]; stop_reason?: unknown; usage?: Record<string, unknown> } | null;
  const model = typeof message?.model === "string" ? message.model : null;
  const requestId = response.requestId ?? (typeof message?.id === "string" ? message.id : null);
  const raw = Array.isArray(message?.content) ? message.content.filter(b => b?.type === "text" && typeof b.text === "string").map(b => b.text).join("\n") || null : null;
  const usage = message?.usage && typeof message.usage === "object" && !Array.isArray(message.usage) ? message.usage : null;
  const finishReason = typeof message?.stop_reason === "string" ? message.stop_reason : null;
  const wireFault = !response.ok ? "http" : model !== policy.model ? "wrong-model" : finishReason !== "end_turn" ? "truncated"
    : !requestId ? "no-receipt" : raw === null ? "no-content" : null;
  return { raw, usage, requestId, model, finishReason, wireFault };
}

/** Exactly one Messages request. No hidden retries, provider fallback or paid
 * authority here: the caller must reserve and retain through purchaseOnce. */
export async function requestAnthropicVisualReview(apiKey: string, request: AnthropicVisualReviewRequest,
  fetchOnce: typeof fetch = fetch): Promise<AnthropicVisualReviewReply> {
  if (!apiKey.trim()) throw Error("ANTHROPIC_API_KEY is required before reserving an Opus review");
  const policy = visualReviewPolicy("scene-quality", request.effort);
  const timeoutMs = request.timeoutMs ?? policy.timeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > policy.timeoutMs) throw Error("Invalid Opus visual evidence or output limit");
  const body = anthropicVisualReviewBody(request, "standard_only");
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeoutMs);
  const empty: AnthropicVisualReviewReply = { raw: null, usage: null, requestId: null, model: null, finishReason: null, wireFault: "timeout", costUnknown: true };
  let response: Response;
  try {
    response = await fetchOnce(policy.endpoint, { method: "POST", redirect: "error", signal: abort.signal,
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body) });
  } catch { clearTimeout(timer); return empty; }
  let parsed: unknown;
  try { parsed = await response.json(); }
  catch { clearTimeout(timer); return { ...empty, wireFault: abort.signal.aborted ? "timeout" : "not-json", requestId: response.headers.get("request-id") }; }
  finally { clearTimeout(timer); }
  const reading = readAnthropicVisualReview(policy, { ok: response.ok, requestId: response.headers.get("request-id") }, parsed);
  return { ...reading, costUnknown: visualReviewCharge(policy, reading.model, reading.usage).costUnknown };
}
