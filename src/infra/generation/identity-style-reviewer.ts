import { BOARD_JUDGE_MODEL, BOARD_JUDGE_MAX_TOKENS } from "./board-verdict";

export const FULL_SOURCE_STRICT_RESPONSE_FORMAT = {
  type: "json_schema", json_schema: { name: "full_source_identity_checks_v1", strict: true,
    schema: { type: "object", additionalProperties: false, required: ["checks", "reason"],
      properties: { checks: { type: "object", additionalProperties: false,
        required: ["identity", "age", "paintedStyle", "sheetLayout", "sourceFaceVisible", "facialVolume", "viewConsistency"],
        properties: Object.fromEntries(["identity", "age", "paintedStyle", "sheetLayout", "sourceFaceVisible", "facialVolume", "viewConsistency"]
          .map(key => [key, { type: "string", enum: ["pass", "fail", "uncertain"] }])) },
        reason: { type: "string", pattern: "^\\S([\\s\\S]{0,1198}\\S)?$" } } } },
} as const;

export type IdentityReviewInput = { prompt: string; images: readonly Buffer[];
  settings?: { model: string; effort: "low" | "medium" | "high"; maxOutputTokens: number }; timeoutMs?: number; timeoutPolicy?: "full-source-v1"; responseFormatPolicy?: "full-source-strict-v1" };
export interface IdentityStyleReviewer {
  review(input: IdentityReviewInput): Promise<{ httpOk: boolean; httpStatus?: number; bodyFormat?: "json" | "non-json"; requestId: string | null; body: unknown }>;
}

/** One transport attempt, no SDK retry or image repair. The service reserves
 * and settles the request; this adapter never decides approval or ownership. */
export class OpenAiIdentityStyleReviewer implements IdentityStyleReviewer {
  constructor(private readonly apiKey: string, private readonly fetchOnce: typeof fetch = fetch) {
    if (!apiKey?.trim()) throw new Error("Identity reviewer requires the configured existing credential");
  }
  async review(input: IdentityReviewInput) {
    const settings = input.settings ?? { model: BOARD_JUDGE_MODEL, effort: "high", maxOutputTokens: BOARD_JUDGE_MAX_TOKENS };
    const fullSource = input.timeoutPolicy === "full-source-v1";
    if (fullSource && (settings.model !== "gpt-6.1-sol" || settings.effort !== "high" || settings.maxOutputTokens !== 6500))
      throw Error("Full-source review timeout requires its exact Sol HIGH contract");
    if (input.responseFormatPolicy && (!fullSource || input.responseFormatPolicy !== "full-source-strict-v1"))
      throw Error("Strict identity output requires the full-source HIGH contract");
    const ceiling = fullSource ? 180_000 : 90_000;
    const timeoutMs = Math.min(ceiling, input.timeoutMs ?? ceiling);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("Identity review dispatch window expired");
    const response = await this.fetchOnce("https://api.openai.com/v1/chat/completions", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.model, reasoning_effort: settings.effort, max_completion_tokens: settings.maxOutputTokens,
        service_tier: "default", store: false, response_format: input.responseFormatPolicy ? FULL_SOURCE_STRICT_RESPONSE_FORMAT : { type: "json_object" },
        messages: [{ role: "user", content: [{ type: "text", text: input.prompt }, ...input.images.map(png => ({ type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}`, detail: "high" } }))] }] }),
    });
    let body: unknown;
    try { body = await response.json() as unknown; } catch (error) {
      if (!fullSource) throw error; // Legacy transport behavior and retained receipts stay unchanged.
      return { httpOk: response.ok, httpStatus: response.status, requestId: response.headers.get("x-request-id"),
        body: null, bodyFormat: "non-json" as const };
    }
    return { httpOk: response.ok, httpStatus: response.status, requestId: response.headers.get("x-request-id"), body, bodyFormat: "json" as const };
  }
}
