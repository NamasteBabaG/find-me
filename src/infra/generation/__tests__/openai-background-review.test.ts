import { describe, expect, it, vi } from "vitest";
import { visualReviewPolicy } from "../../../domain/generation/visual-review-policy";
import { OpenAiBackgroundReviews, solBackgroundReviewBody } from "../openai-background-review";
import { visualReviewCharge } from "../visual-review-pricing";
import { BackgroundReviewRefused } from "../types";
import { PROVIDER_ERROR_MESSAGE_MAX, WITHHELD_PROVIDER_ERROR_CODE } from "../../../domain/generation/background-provider-error";

const policy = visualReviewPolicy("head-continuity", "high", undefined, "responses-background");
const png = Buffer.from("synthetic-png-bytes");
const body = solBackgroundReviewBody({ policy, effort: "high", prompt: "Synthetic continuity question", images: [png], labels: ["CASE synthetic"] });
const reply = (status: number, json: unknown) => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });

describe("OpenAI background Responses transport, no network", () => {
  it("asks Sol HIGH in the background, unstored, with each label beside its image", async () => {
    expect(body).toMatchObject({ model: "gpt-6.1-sol", background: true, store: false, reasoning: { effort: "high" }, max_output_tokens: 4096,
      text: { format: { type: "json_object" } } });
    const content = (body.input as { content: { type: string; text?: string; detail?: string }[] }[])[0]!.content;
    expect(content.map(part => part.type)).toEqual(["input_text", "input_text", "input_image"]);
    expect(content[2]!.detail).toBe("high");
    expect(() => solBackgroundReviewBody({ policy: visualReviewPolicy("head-continuity", "high"), effort: "high", prompt: "x", images: [png], labels: ["x"] })).toThrow();
    const fetchOnce = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => reply(200, { id: "resp_synthetic1", status: "queued" }));
    const transport = new OpenAiBackgroundReviews("synthetic-key-never-live", fetchOnce as unknown as typeof fetch);
    expect(await transport.create(body)).toEqual({ responseId: "resp_synthetic1" });
    const [url, init] = fetchOnce.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(JSON.parse(String(init!.body))).toEqual(body);
    await expect(transport.create({ ...body, background: false })).rejects.toThrow();
  });
  it("tells a documented refusal (nothing created) from an uncertain create", async () => {
    const refusing = new OpenAiBackgroundReviews("synthetic", (async () => reply(429, { error: { type: "insufficient_quota", code: "insufficient_quota" } })) as unknown as typeof fetch);
    await expect(refusing.create(body)).rejects.toBeInstanceOf(BackgroundReviewRefused);
    const failing = new OpenAiBackgroundReviews("synthetic", (async () => reply(500, { error: { type: "server_error" } })) as unknown as typeof fetch);
    await expect(failing.create(body)).rejects.not.toBeInstanceOf(BackgroundReviewRefused);
    const lost = new OpenAiBackgroundReviews("synthetic", (async () => { throw new Error("socket hang up"); }) as unknown as typeof fetch);
    await expect(lost.create(body)).rejects.toThrow("socket hang up");
    const noId = new OpenAiBackgroundReviews("synthetic", (async () => reply(200, { status: "queued" })) as unknown as typeof fetch);
    await expect(noId.create(body)).rejects.toThrow(/uncertain/);
  });
  it("reads running, finished, cut and expired responses by id, from the documented path only", async () => {
    const answers = [reply(200, { id: "resp_a", status: "in_progress" }),
      reply(200, { id: "resp_a", status: "completed", model: "gpt-6.1-sol", service_tier: "default", usage: { input_tokens: 2000, output_tokens: 500 },
        output: [{ type: "reasoning", summary: [] }, { type: "message", status: "completed", content: [{ type: "output_text", text: "{\"cases\":[]}" }] }] }),
      reply(200, { id: "resp_a", status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, model: "gpt-6.1-sol", usage: { input_tokens: 1, output_tokens: 4096 }, output: [] }),
      reply(404, { error: { type: "invalid_request_error", message: "No response found" } })];
    const fetchOnce = vi.fn(async () => answers.shift()!);
    const transport = new OpenAiBackgroundReviews("synthetic", fetchOnce as unknown as typeof fetch);
    expect(await transport.retrieve("resp_a")).toEqual({ status: "in_progress" });
    expect(await transport.retrieve("resp_a")).toEqual({ status: "completed", reading: { responseId: "resp_a", raw: "{\"cases\":[]}",
      usage: { input_tokens: 2000, output_tokens: 500 }, model: "gpt-6.1-sol", finishReason: "stop", serviceTier: "default" } });
    expect(await transport.retrieve("resp_a")).toMatchObject({ status: "incomplete", reading: { finishReason: "length", raw: null } });
    expect(await transport.retrieve("resp_a")).toEqual({ status: "missing" });
    expect(fetchOnce.mock.calls.every(call => (call as unknown[])[0] === "https://api.openai.com/v1/responses/resp_a")).toBe(true);
    await expect(transport.retrieve("../v1/files")).rejects.toThrow();
  });
  it("keeps what a failed response says about itself, scrubbed: one code token and a short message, never the body (background-provider-error/v1)", async () => {
    const secret = `sk-proj-${"A".repeat(40)}`, image = `data:image/png;base64,${"B".repeat(400)}`;
    const hidden = String.fromCharCode(0x202e) + String.fromCharCode(0x0000) + String.fromCharCode(0x2028);
    const answers = [
      reply(200, { id: "resp_f", status: "failed", model: "gpt-6.1-sol", service_tier: "flex", usage: null, output: [], error: { code: "server_error",
        message: `The server had an error.${hidden} Write to help@example.test or see https://status.example.test/x?key=${secret} ${image} ${"word ".repeat(80)}` } }),
      reply(200, { id: "resp_g", status: "failed", output: [] }),
      reply(200, { id: "resp_h", status: "failed", output: [], error: { code: "Image Content Policy <script>", message: 42 } }),
      reply(200, { id: "resp_i", status: "completed", model: "gpt-6.1-sol", service_tier: "default", usage: { input_tokens: 1, output_tokens: 1 },
        output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }], error: { code: "server_error", message: "stale" } }),
      reply(200, { id: "resp_j", status: "failed", output: [], error: { code: "IMAGE_CONTENT_POLICY_VIOLATION" } }),
    ];
    const transport = new OpenAiBackgroundReviews("synthetic", (async () => answers.shift()!) as unknown as typeof fetch);
    const failed = await transport.retrieve("resp_f");
    expect(failed).toMatchObject({ status: "failed", reading: { responseId: "resp_f", raw: null, usage: null, model: "gpt-6.1-sol", finishReason: "failed",
      serviceTier: "flex", providerError: { code: "server_error" } } });
    const message = (failed as { reading: { providerError: { message: string } } }).reading.providerError.message;
    expect(message.length).toBeLessThanOrEqual(PROVIDER_ERROR_MESSAGE_MAX);
    expect(message.startsWith("The server had an error.")).toBe(true);
    for (const leak of ["sk-proj-", "help@example", "https://", "status.example", "data:", "BBBB", hidden[0]!, hidden[1]!, hidden[2]!])
      expect(JSON.stringify(failed)).not.toContain(leak);
    // No error, no usage and no tier: each read as absent, never invented.
    expect(await transport.retrieve("resp_g")).toEqual({ status: "failed", reading: { responseId: "resp_g", raw: null, usage: null, model: null,
      finishReason: "failed", serviceTier: null } });
    // A code that is not one bounded token is no code; a message that is not text is none: nothing is kept.
    expect(await transport.retrieve("resp_h")).not.toHaveProperty("reading.providerError");
    // A completed response keeps no error at all.
    expect(await transport.retrieve("resp_i")).not.toHaveProperty("reading.providerError");
    // A documented code is kept in its canonical lower case.
    expect(await transport.retrieve("resp_j")).toMatchObject({ reading: { providerError: { code: "image_content_policy_violation", message: null } } });
  });
  it("never records a credential-shaped code or type, from a failed response or a refused create, and names a content-filter stop (Codex QA R2)", async () => {
    const syntheticKey = "sk-" + "q".repeat(48);
    const answers = [
      reply(200, { id: "resp_k", status: "failed", model: "gpt-6.1-sol", output: [], usage: null, error: { code: syntheticKey, message: "Provider reported a failure" } }),
      reply(200, { id: "resp_t", status: "failed", model: "gpt-6.1-sol", output: [], usage: null, error: { type: syntheticKey.toUpperCase() } }),
      reply(200, { id: "resp_c", status: "incomplete", incomplete_details: { reason: "content_filter" }, model: "gpt-6.1-sol", usage: { input_tokens: 1, output_tokens: 1 }, output: [] }),
    ];
    const transport = new OpenAiBackgroundReviews("synthetic", (async () => answers.shift()!) as unknown as typeof fetch);
    for (const responseId of ["resp_k", "resp_t"]) {
      const read = await transport.retrieve(responseId);
      expect(read).toMatchObject({ status: "failed", reading: { providerError: { code: WITHHELD_PROVIDER_ERROR_CODE } } });
      expect(JSON.stringify(read).toLowerCase()).not.toContain("qqqq");
    }
    expect(await transport.retrieve("resp_c")).toMatchObject({ status: "incomplete", reading: { finishReason: "content_filter",
      providerError: { code: "content_filter", message: null } } });
    // A documented refusal records its code only through the same filter: a credential-shaped one is withheld, in any field.
    for (const [error, recorded] of [[{ code: syntheticKey }, WITHHELD_PROVIDER_ERROR_CODE], [{ type: syntheticKey }, WITHHELD_PROVIDER_ERROR_CODE],
      [{ code: 5, type: "Insufficient_Quota" }, "insufficient_quota"], [{ message: "no code" }, null]] as const) {
      const refusing = new OpenAiBackgroundReviews("synthetic", (async () => reply(429, { error })) as unknown as typeof fetch);
      const refusal = await refusing.create(body).catch((caught: unknown) => caught);
      expect(refusal).toBeInstanceOf(BackgroundReviewRefused);
      expect(refusal).toMatchObject({ status: 429, errorType: recorded });
      expect(`${JSON.stringify(refusal)} ${(refusal as Error).message}`).not.toContain("qqqq");
    }
  });
  it("prices a Responses usage on the same card, and nothing else", () => {
    expect(visualReviewCharge(policy, "gpt-6.1-sol", { input_tokens: 10_000, output_tokens: 4_096 })).toEqual({ costCents: 6.596, costUnknown: false });
    expect(visualReviewCharge(policy, "gpt-6.1-sol", { prompt_tokens: 10_000, completion_tokens: 4_096 })).toMatchObject({ costUnknown: true });
    expect(visualReviewCharge(policy, "gpt-6.1-sol-other", { input_tokens: 1, output_tokens: 1 })).toMatchObject({ costUnknown: true });
    // The synchronous question's pricing is unchanged.
    expect(visualReviewCharge(visualReviewPolicy("head-continuity", "high"), "gpt-6.1-sol", { prompt_tokens: 10_000, completion_tokens: 4_096 })).toEqual({ costCents: 6.596, costUnknown: false });
  });
});
