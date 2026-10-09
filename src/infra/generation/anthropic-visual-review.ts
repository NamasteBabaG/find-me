import { visualReviewPolicy, type VisualReviewEffort } from "../../domain/generation/visual-review-policy";
import { visualReviewCharge } from "./visual-review-pricing";

export type AnthropicVisualReviewReply = {
  raw: string | null; usage: Record<string, unknown> | null; requestId: string | null;
  model: string | null; finishReason: string | null;
  wireFault: "http" | "no-content" | "not-json" | "truncated" | "wrong-model" | "no-receipt" | "timeout" | null;
  costUnknown: boolean;
};
/** Exactly one Messages request. No hidden retries, provider fallback or paid
 * authority here: the caller must reserve and retain through purchaseOnce. */
export async function requestAnthropicVisualReview(apiKey: string, request: {
  prompt: string; images: readonly Buffer[]; imageLabels: readonly string[]; effort: VisualReviewEffort;
  timeoutMs?: number; maxOutputTokens?: number;
}, fetchOnce: typeof fetch = fetch): Promise<AnthropicVisualReviewReply> {
  if (!apiKey.trim()) throw Error("ANTHROPIC_API_KEY is required before reserving an Opus review");
  const policy = visualReviewPolicy("scene-quality", request.effort);
  const maximum = request.maxOutputTokens ?? policy.maxOutputTokens;
  const timeoutMs = request.timeoutMs ?? policy.timeoutMs;
  if (!request.prompt.trim() || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > policy.maxOutputTokens
    || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > policy.timeoutMs
    || !request.images.length || request.images.length > 30 || request.images.length !== request.imageLabels.length
    || request.images.some(b => !b.length || b.length > 5 * 1024 * 1024) || request.imageLabels.some(l => !l.trim()))
    throw Error("Invalid Opus visual evidence or output limit");
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeoutMs);
  const empty: AnthropicVisualReviewReply = { raw: null, usage: null, requestId: null, model: null, finishReason: null, wireFault: "timeout", costUnknown: true };
  let response: Response;
  try {
    response = await fetchOnce(policy.endpoint, { method: "POST", redirect: "error", signal: abort.signal,
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: policy.model, max_tokens: maximum, service_tier: "standard_only",
        output_config: { effort: request.effort }, thinking: { type: "adaptive" },
        messages: [{ role: "user", content: [{ type: "text", text: request.prompt },
          ...request.images.flatMap((png, i) => [{ type: "text", text: request.imageLabels[i]! },
            { type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } }])] }],
      }) });
  } catch { clearTimeout(timer); return empty; }
  let body: { id?: unknown; model?: unknown; content?: { type?: string; text?: string }[]; stop_reason?: unknown; usage?: Record<string, unknown> } | null;
  try { body = await response.json() as typeof body; }
  catch { clearTimeout(timer); return { ...empty, wireFault: abort.signal.aborted ? "timeout" : "not-json", requestId: response.headers.get("request-id") }; }
  finally { clearTimeout(timer); }
  const model = typeof body?.model === "string" ? body.model : null;
  const requestId = response.headers.get("request-id") ?? (typeof body?.id === "string" ? body.id : null);
  const raw = Array.isArray(body?.content) ? body.content.filter(b => b?.type === "text" && typeof b.text === "string").map(b => b.text).join("\n") || null : null;
  const usage = body?.usage && typeof body.usage === "object" && !Array.isArray(body.usage) ? body.usage : null;
  const finishReason = typeof body?.stop_reason === "string" ? body.stop_reason : null;
  const wireFault = !response.ok ? "http" : model !== policy.model ? "wrong-model" : finishReason !== "end_turn" ? "truncated"
    : !requestId ? "no-receipt" : raw === null ? "no-content" : null;
  return { raw, usage, requestId, model, finishReason, wireFault, costUnknown: visualReviewCharge(policy, model, usage).costUnknown };
}
