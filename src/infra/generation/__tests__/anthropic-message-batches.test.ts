import { describe, expect, it, vi } from "vitest";
import { AnthropicMessageBatches, QUALITY_BATCH_CLOCK_SKEW_MS } from "../anthropic-message-batches";
import { QualityBatchRefused } from "../types";
import { anthropicVisualReviewBody, requestAnthropicVisualReview } from "../anthropic-visual-review";
import { visualReviewBatchCharge, visualReviewCharge } from "../visual-review-pricing";
import { visualReviewPolicy } from "../../../domain/generation/visual-review-policy";

/** Message Batches on a scripted wire: no network, no key. */
const POLICY = visualReviewPolicy("scene-quality", "high");
const reply = (status: number, body: unknown, text?: string) => new Response(text ?? JSON.stringify(body), { status });
const wire = (...answers: Response[]) => vi.fn<typeof fetch>(async () => answers.shift() ?? reply(500, { type: "error", error: { type: "api_error" } }));
const request = { prompt: "Inspect the hide.", images: [Buffer.from("png-one"), Buffer.from("png-two")], imageLabels: ["first", "second"], effort: "high" as const };
const sent = (fetcher: ReturnType<typeof wire>, call = 0) => {
  const [url, init] = fetcher.mock.calls[call] as unknown as [string, RequestInit & { headers: Record<string, string> }];
  return { url, init, body: init.body ? JSON.parse(String(init.body)) : null };
};
const ended = (id: string, createdAt: string, status = "ended") => ({ id, created_at: createdAt, processing_status: status });
const line = (customId: string, result: unknown) => JSON.stringify({ custom_id: customId, result });

describe("Anthropic Message Batches transport", () => {
  it("sends the synchronous Opus body without its tier, and the synchronous route still sends standard_only", async () => {
    const params = anthropicVisualReviewBody(request, null);
    expect(params).not.toHaveProperty("service_tier");
    const fetcher = wire(reply(200, { id: "msgbatch_abc", processing_status: "in_progress" }));
    await expect(new AnthropicMessageBatches("synthetic", fetcher).create([{ customId: "q1", params }])).resolves.toEqual({ batchId: "msgbatch_abc" });
    const { url, init, body } = sent(fetcher);
    expect(url).toBe("https://api.anthropic.com/v1/messages/batches");
    expect(init).toMatchObject({ method: "POST", redirect: "error", headers: { "x-api-key": "synthetic", "anthropic-version": "2023-06-01" } });
    expect(body).toEqual({ requests: [{ custom_id: "q1", params }] });
    // The synchronous request is the same body plus its tier, field for field.
    const sync = wire(reply(200, { id: "msg_1", model: POLICY.model, content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }));
    await requestAnthropicVisualReview("synthetic", request, sync);
    expect(sent(sync).body).toEqual({ ...params, service_tier: "standard_only" });
    expect(Object.keys(sent(sync).body)).toEqual(["model", "max_tokens", "service_tier", "output_config", "thinking", "messages"]);
  });

  it("reports only documented, enveloped refusals as proof that nothing was created", async () => {
    const create = (answer: Response) => new AnthropicMessageBatches("synthetic", wire(answer)).create([{ customId: "q1", params: {} }]);
    await expect(create(reply(429, { type: "error", error: { type: "rate_limit_error" } }))).rejects.toMatchObject({ name: "QualityBatchRefused", status: 429, transient: true });
    await expect(create(reply(400, { type: "error", error: { type: "invalid_request_error" } }))).rejects.toMatchObject({ status: 400, transient: false });
    for (const answer of [reply(403, null, "<html>forbidden</html>"), reply(500, { type: "error", error: { type: "api_error" } }),
      reply(529, { type: "error", error: { type: "overloaded_error" } }), reply(200, { processing_status: "in_progress" }), reply(200, null, "not json")]) {
      const error = await create(answer).catch(e => e);
      expect(error).not.toBeInstanceOf(QualityBatchRefused);
      expect(String(error.message)).toContain("uncertain");
    }
    const lost = new AnthropicMessageBatches("synthetic", vi.fn<typeof fetch>(async () => { throw Error("socket hang up"); }));
    await expect(lost.create([{ customId: "q1", params: {} }])).rejects.not.toBeInstanceOf(QualityBatchRefused);
  });

  it("refuses malformed custom ids and batch ids before any request", async () => {
    const fetcher = wire();
    const batches = new AnthropicMessageBatches("synthetic", fetcher);
    await expect(batches.create([{ customId: "has:colon", params: {} }])).rejects.toThrow("custom ids");
    await expect(batches.create([{ customId: "q1", params: {} }, { customId: "q1", params: {} }])).rejects.toThrow("custom ids");
    for (const id of ["../v1/files", "msgbatch_x/../../y", "https://evil.example/msgbatch_1"]) await expect(batches.status(id)).rejects.toThrow("not a Message Batch id");
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => new AnthropicMessageBatches(" ")).toThrow("ANTHROPIC_API_KEY");
  });

  it("finds a batch only by its results, newest first, back to the intent, and is undecided while a candidate runs", async () => {
    const since = Date.parse("2026-10-16T08:00:00.000Z"), at = (minutes: number) => new Date(since + minutes * 60_000).toISOString();
    const page1 = { data: [ended("msgbatch_new", at(30)), ended("msgbatch_mine", at(5))], has_more: true, last_id: "msgbatch_mine" };
    const page2 = { data: [ended("msgbatch_old", new Date(since - QUALITY_BATCH_CLOCK_SKEW_MS - 1).toISOString())], has_more: true, last_id: "msgbatch_old" };
    const fetcher = wire(reply(200, page1), reply(200, null, line("q-other", { type: "succeeded", message: {} })),
      reply(200, null, [line("q-mine", { type: "succeeded", message: {} }), line("q-x", { type: "canceled" })].join("\n")), reply(200, page2));
    await expect(new AnthropicMessageBatches("synthetic", fetcher).find("q-mine", since)).resolves.toEqual({ proven: ["msgbatch_mine"], undecided: false });
    // Pages by the documented cursor; reads results from the documented path, never a supplied URL; stops at the intent.
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.anthropic.com/v1/messages/batches?limit=1000",
      "https://api.anthropic.com/v1/messages/batches/msgbatch_new/results",
      "https://api.anthropic.com/v1/messages/batches/msgbatch_mine/results",
      "https://api.anthropic.com/v1/messages/batches?limit=1000&after_id=msgbatch_mine"]);
    const running = wire(reply(200, { data: [ended("msgbatch_run", at(1), "in_progress")], has_more: false }));
    await expect(new AnthropicMessageBatches("synthetic", running).find("q-mine", since)).resolves.toEqual({ proven: [], undecided: true });
    const unreadable = wire(reply(503, { type: "error", error: { type: "api_error" } }));
    await expect(new AnthropicMessageBatches("synthetic", unreadable).find("q-mine", since)).rejects.toThrow("list answered 503");
  });

  it("reads every documented result type and keeps an unknown one as unrecognised", async () => {
    const fetcher = wire(reply(200, null, [line("a", { type: "succeeded", message: { id: "msg_a" } }),
      line("b", { type: "errored", error: { type: "error", error: { type: "invalid_request_error", message: "x" } } }),
      line("c", { type: "canceled" }), line("d", { type: "expired" }), line("e", { type: "mystery" })].join("\n") + "\n"));
    await expect(new AnthropicMessageBatches("synthetic", fetcher).results("msgbatch_1")).resolves.toEqual([
      { customId: "a", type: "succeeded", message: { id: "msg_a" } }, { customId: "b", type: "errored", errorType: "invalid_request_error" },
      { customId: "c", type: "canceled" }, { customId: "d", type: "expired" }, { customId: "e", type: "unrecognized", resultType: "mystery" }]);
    await expect(new AnthropicMessageBatches("synthetic", wire(reply(200, null, "{broken"))).results("msgbatch_1")).rejects.toThrow("unreadable result line");
  });

  it("reads status, cancels, and counts a deletion only when it is acknowledged", async () => {
    const fetcher = wire(reply(200, { id: "msgbatch_1", processing_status: "canceling" }), reply(200, { id: "msgbatch_1", processing_status: "canceling" }),
      reply(200, { id: "msgbatch_1", type: "message_batch_deleted" }), reply(404, { type: "error", error: { type: "not_found_error" } }), reply(200, { id: "msgbatch_1" }));
    const batches = new AnthropicMessageBatches("synthetic", fetcher);
    await expect(batches.status("msgbatch_1")).resolves.toBe("canceling");
    await expect(batches.cancel("msgbatch_1")).resolves.toBeUndefined();
    await expect(batches.remove("msgbatch_1")).resolves.toBeUndefined();
    await expect(batches.remove("msgbatch_1")).resolves.toBeUndefined();
    await expect(batches.remove("msgbatch_1")).rejects.toThrow("not acknowledged");
    expect(fetcher.mock.calls.map(([url, init]) => `${(init as RequestInit).method} ${url}`)).toEqual([
      "GET https://api.anthropic.com/v1/messages/batches/msgbatch_1", "POST https://api.anthropic.com/v1/messages/batches/msgbatch_1/cancel",
      "DELETE https://api.anthropic.com/v1/messages/batches/msgbatch_1", "DELETE https://api.anthropic.com/v1/messages/batches/msgbatch_1",
      "DELETE https://api.anthropic.com/v1/messages/batches/msgbatch_1"]);
    await expect(new AnthropicMessageBatches("synthetic", wire(reply(200, { id: "msgbatch_other", processing_status: "ended" }))).status("msgbatch_1")).rejects.toThrow("recognised status");
  });
});

describe("pricing an Opus answer by the tier that served it", () => {
  it("prices the batch tier at exactly half of every standard rate (E5's 16,665 in and 1,842 out: 51,750 micro-USD)", () => {
    const usage = { input_tokens: 16665, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
      output_tokens: 1842, output_tokens_details: { thinking_tokens: 816 }, service_tier: "batch", inference_geo: "global" };
    const charge = visualReviewBatchCharge(POLICY, POLICY.model, usage);
    expect(charge).toEqual({ costCents: 5.175, costUnknown: false });
    expect(Math.ceil(charge.costCents * 10_000)).toBe(51_750);
    const cached = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 200, cache_creation_input_tokens: 300,
      cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 } };
    expect(visualReviewBatchCharge(POLICY, POLICY.model, { ...cached, service_tier: "batch" }).costCents * 2)
      .toBeCloseTo(visualReviewCharge(POLICY, POLICY.model, { ...cached, service_tier: "standard" }).costCents, 12);
  });

  it("prices the standard tier at the standard card, and no other tier at all", () => {
    const usage = { input_tokens: 2000, output_tokens: 500 };
    expect(visualReviewBatchCharge(POLICY, POLICY.model, { ...usage, service_tier: "standard" })).toEqual(visualReviewCharge(POLICY, POLICY.model, usage));
    for (const tier of [undefined, "priority", "flex", "", "BATCH"]) expect(visualReviewBatchCharge(POLICY, POLICY.model, { ...usage, service_tier: tier }).costUnknown).toBe(true);
    expect(visualReviewBatchCharge(POLICY, "claude-sonnet-5-5", { ...usage, service_tier: "batch" }).costUnknown).toBe(true);
    expect(visualReviewBatchCharge(POLICY, POLICY.model, null).costUnknown).toBe(true);
    expect(visualReviewBatchCharge(visualReviewPolicy("head-continuity", "high"), "gpt-6.1-sol", { prompt_tokens: 1, completion_tokens: 1, service_tier: "batch" }).costUnknown).toBe(true);
  });
});
