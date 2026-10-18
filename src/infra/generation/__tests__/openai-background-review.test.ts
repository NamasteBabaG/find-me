import { describe, expect, it, vi } from "vitest";
import { visualReviewPolicy } from "../../../domain/generation/visual-review-policy";
import { OpenAiBackgroundReviews, solBackgroundReviewBody } from "../openai-background-review";
import { visualReviewCharge } from "../visual-review-pricing";
import { BackgroundReviewRefused } from "../types";

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
  it("prices a Responses usage on the same card, and nothing else", () => {
    expect(visualReviewCharge(policy, "gpt-6.1-sol", { input_tokens: 10_000, output_tokens: 4_096 })).toEqual({ costCents: 6.596, costUnknown: false });
    expect(visualReviewCharge(policy, "gpt-6.1-sol", { prompt_tokens: 10_000, completion_tokens: 4_096 })).toMatchObject({ costUnknown: true });
    expect(visualReviewCharge(policy, "gpt-6.1-sol-other", { input_tokens: 1, output_tokens: 1 })).toMatchObject({ costUnknown: true });
    // The synchronous question's pricing is unchanged.
    expect(visualReviewCharge(visualReviewPolicy("head-continuity", "high"), "gpt-6.1-sol", { prompt_tokens: 10_000, completion_tokens: 4_096 })).toEqual({ costCents: 6.596, costUnknown: false });
  });
});
