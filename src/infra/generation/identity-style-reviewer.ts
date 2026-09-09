import { BOARD_JUDGE_MODEL, BOARD_JUDGE_MAX_TOKENS } from "./board-verdict";

export interface IdentityStyleReviewer {
  review(input: { prompt: string; images: readonly Buffer[] }): Promise<{ httpOk: boolean; requestId: string | null; body: unknown }>;
}

/** One transport attempt, no SDK retry or image repair. The service reserves
 * and settles the request; this adapter never decides approval or ownership. */
export class OpenAiIdentityStyleReviewer implements IdentityStyleReviewer {
  constructor(private readonly apiKey: string, private readonly fetchOnce: typeof fetch = fetch) {
    if (!apiKey?.trim()) throw new Error("Identity reviewer requires the configured existing credential");
  }
  async review(input: { prompt: string; images: readonly Buffer[] }) {
    const response = await this.fetchOnce("https://api.openai.com/v1/chat/completions", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(90_000),
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: BOARD_JUDGE_MODEL, reasoning_effort: "high", max_completion_tokens: BOARD_JUDGE_MAX_TOKENS,
        service_tier: "default", store: false, response_format: { type: "json_object" },
        messages: [{ role: "user", content: [{ type: "text", text: input.prompt }, ...input.images.map(png => ({ type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}`, detail: "high" } }))] }] }),
    });
    return { httpOk: response.ok, requestId: response.headers.get("x-request-id"), body: await response.json() as unknown };
  }
}
