import { BOARD_JUDGE_MODEL, BOARD_JUDGE_MAX_TOKENS } from "./board-verdict";

export type IdentityReviewInput = { prompt: string; images: readonly Buffer[];
  settings?: { model: string; effort: "low" | "high"; maxOutputTokens: number }; timeoutMs?: number };
export interface IdentityStyleReviewer {
  review(input: IdentityReviewInput): Promise<{ httpOk: boolean; requestId: string | null; body: unknown }>;
}

/** One transport attempt, no SDK retry or image repair. The service reserves
 * and settles the request; this adapter never decides approval or ownership. */
export class OpenAiIdentityStyleReviewer implements IdentityStyleReviewer {
  constructor(private readonly apiKey: string, private readonly fetchOnce: typeof fetch = fetch) {
    if (!apiKey?.trim()) throw new Error("Identity reviewer requires the configured existing credential");
  }
  async review(input: IdentityReviewInput) {
    const settings = input.settings ?? { model: BOARD_JUDGE_MODEL, effort: "high", maxOutputTokens: BOARD_JUDGE_MAX_TOKENS };
    const timeoutMs = Math.min(90_000, input.timeoutMs ?? 90_000);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("Identity review dispatch window expired");
    const response = await this.fetchOnce("https://api.openai.com/v1/chat/completions", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.model, reasoning_effort: settings.effort, max_completion_tokens: settings.maxOutputTokens,
        service_tier: "default", store: false, response_format: { type: "json_object" },
        messages: [{ role: "user", content: [{ type: "text", text: input.prompt }, ...input.images.map(png => ({ type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}`, detail: "high" } }))] }] }),
    });
    return { httpOk: response.ok, requestId: response.headers.get("x-request-id"), body: await response.json() as unknown };
  }
}
