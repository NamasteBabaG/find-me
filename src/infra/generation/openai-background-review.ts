import { isBackgroundReviewPolicy, type VisualReviewEffort, type VisualReviewPolicy } from "../../domain/generation/visual-review-policy";
import { BackgroundReviewRefused, type BackgroundReviewState, type BackgroundReviewTransport } from "./types";

/**
 * OpenAI Responses in background mode over raw HTTP, like the synchronous Sol
 * transport: one request per call, no hidden retry, `redirect: "error"` so the key
 * never follows a redirect. Endpoints (developers.openai.com, checked 2026-10-18):
 * POST /v1/responses with `background: true` answers at once with the response id
 * and `queued`/`in_progress`; GET /v1/responses/{id} reads it until a terminal
 * status (`completed`, `failed`, `cancelled`, `incomplete`); POST
 * /v1/responses/{id}/cancel. With `store: false` the provider keeps a background
 * response only about ten minutes for polling; after that it is gone (404).
 *
 * Results are read only from the documented path of a checked response id.
 */
const BASE = "https://api.openai.com";
const RESPONSE_ID = /^resp_[A-Za-z0-9_-]{1,200}$/;
/** Documented refusals answered before anything is created; only these, with their error envelope, prove absence. */
const REFUSALS: ReadonlySet<number> = new Set([400, 401, 403, 404, 413, 429]);
const CREATE_TIMEOUT_MS = 90_000, READ_TIMEOUT_MS = 30_000;

const parse = (text: string): Record<string, unknown> | null => {
  try { const value: unknown = JSON.parse(text); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
  catch { return null; }
};
const checked = (responseId: string) => {
  if (typeof responseId !== "string" || !RESPONSE_ID.test(responseId)) throw Error("BACKGROUND_REVIEW: not a response id");
  return responseId;
};

/** The exact background body of one prepared Sol question: the synchronous question's
 * model, effort, output cap, JSON answer and evidence order, each label adjacent to its image. */
export function solBackgroundReviewBody(question: { policy: VisualReviewPolicy; effort: VisualReviewEffort; prompt: string;
  images: readonly Buffer[]; labels: readonly string[] }): Record<string, unknown> {
  const { policy } = question;
  if (!isBackgroundReviewPolicy(policy) || policy.model !== "gpt-6.1-sol" || question.effort !== policy.effort
    || !question.prompt.trim() || !question.images.length || question.images.length !== question.labels.length)
    throw Error("BACKGROUND_REVIEW: only a prepared Sol background question has a background body");
  return {
    model: policy.model, background: true, store: false, service_tier: "default",
    reasoning: { effort: policy.effort }, max_output_tokens: policy.maxOutputTokens,
    text: { format: { type: "json_object" } },
    input: [{ role: "user", content: [{ type: "input_text", text: question.prompt },
      ...question.images.flatMap((png, i) => [{ type: "input_text", text: question.labels[i]! },
        { type: "input_image", image_url: `data:image/png;base64,${png.toString("base64")}`, detail: "high" }])] }],
  };
}

export class OpenAiBackgroundReviews implements BackgroundReviewTransport {
  readonly namespace = "openai:find-me-existing";
  constructor(private readonly apiKey: string, private readonly fetchOnce: typeof fetch = fetch) {
    if (!apiKey.trim()) throw Error("OPENAI_API_KEY is required for background reviews");
  }

  /** The whole answer, body included, inside one deadline. A throw here is a lost answer. */
  private async call(path: string, init: { method: "GET" | "POST"; body?: string }, timeoutMs: number) {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const response = await this.fetchOnce(`${BASE}${path}`, { ...init, redirect: "error", signal: abort.signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" } });
      return { status: response.status, ok: response.ok, text: await response.text() };
    } finally { clearTimeout(timer); }
  }

  async create(body: Readonly<Record<string, unknown>>) {
    if (body.background !== true || body.store !== false) throw Error("BACKGROUND_REVIEW: only a background, unstored request is created here");
    const answer = await this.call("/v1/responses", { method: "POST", body: JSON.stringify(body) }, CREATE_TIMEOUT_MS);
    const parsed = parse(answer.text);
    if (!answer.ok) {
      const error = parsed?.error && typeof parsed.error === "object" ? parsed.error as { type?: unknown; code?: unknown } : null;
      const type = typeof error?.code === "string" ? error.code : typeof error?.type === "string" ? error.type : null;
      if (REFUSALS.has(answer.status) && error) throw new BackgroundReviewRefused(answer.status, type);
      throw Error(`BACKGROUND_REVIEW: create answered ${answer.status}; whether a response exists is uncertain`);
    }
    if (typeof parsed?.id !== "string" || !RESPONSE_ID.test(parsed.id)) throw Error("BACKGROUND_REVIEW: create answered without a response id; whether a response exists is uncertain");
    return { responseId: parsed.id };
  }

  async retrieve(responseId: string): Promise<BackgroundReviewState> {
    const answer = await this.call(`/v1/responses/${checked(responseId)}`, { method: "GET" }, READ_TIMEOUT_MS);
    const body = parse(answer.text);
    if (answer.status === 404 && body?.error) return { status: "missing" };
    if (!answer.ok || !body || body.id !== responseId) throw Error(`BACKGROUND_REVIEW: ${responseId} answered ${answer.status} without its record`);
    const status = body.status;
    if (status === "queued" || status === "in_progress") return { status };
    if (status !== "completed" && status !== "failed" && status !== "cancelled" && status !== "incomplete")
      throw Error(`BACKGROUND_REVIEW: ${responseId} has no recognised status`);
    const output = Array.isArray(body.output) ? body.output as Record<string, unknown>[] : [];
    const texts = output.filter(item => item?.type === "message").flatMap(item => Array.isArray(item.content) ? item.content as Record<string, unknown>[] : [])
      .filter(part => part?.type === "output_text" && typeof part.text === "string").map(part => part.text as string);
    const incomplete = body.incomplete_details && typeof body.incomplete_details === "object" ? (body.incomplete_details as { reason?: unknown }).reason : null;
    const usage = body.usage && typeof body.usage === "object" && !Array.isArray(body.usage) ? body.usage as Record<string, unknown> : null;
    return { status, reading: { responseId, raw: texts.length ? texts.join("\n") : null, usage,
      model: typeof body.model === "string" ? body.model : null,
      finishReason: status === "completed" ? "stop" : incomplete === "max_output_tokens" ? "length" : typeof incomplete === "string" ? incomplete : status,
      serviceTier: typeof body.service_tier === "string" ? body.service_tier : null } };
  }

  async cancel(responseId: string) {
    const answer = await this.call(`/v1/responses/${checked(responseId)}/cancel`, { method: "POST" }, READ_TIMEOUT_MS);
    if (!answer.ok) throw Error(`BACKGROUND_REVIEW: cancel of ${responseId} answered ${answer.status}`);
  }
}
