import { describe, expect, it, vi } from "vitest";
import { visualReviewPolicy } from "../../../domain/generation/visual-review-policy";
import { visualReviewCharge } from "../../../infra/generation/visual-review-pricing";
import { requestAnthropicVisualReview } from "../../../infra/generation/anthropic-visual-review";
import { buyVisualReview, prepareVisualReview, requestVisualReview, type VisualReviewQuestion } from "../visual-review";
import { localPatchBoardJudgeSettings } from "../local-patch-judge";
import type { PurchaseLedger, RetainedPurchase, RetainedPurchaseStore } from "../paid-operation";
import type { WorldBudgetRequest } from "../world-budget";

const question = (role: VisualReviewQuestion["role"] = "scene-quality"): VisualReviewQuestion => ({ role, effort: "medium", prompt: "Inspect the synthetic evidence. Return JSON.",
  images: [Buffer.from("synthetic-png")], labels: ["CASE synthetic FINAL AFTER context"] });
const opusBody = (over: Record<string, unknown> = {}) => ({ id: "msg-test", model: "claude-opus-5-5", stop_reason: "end_turn",
  content: [{ type: "thinking", thinking: "not exposed" }, { type: "text", text: '{"cases":[]}' }],
  usage: { input_tokens: 1000, output_tokens: 500 }, ...over });
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "request-id": "req-test", "x-request-id": "req-test" } });

function purchaseFixture() {
  const rows = new Map<string, WorldBudgetRequest>(), retained = new Map<string, RetainedPurchase>();
  const ledger: PurchaseLedger = {
    readRequest: async (_, key) => rows.get(key) ?? null,
    reserve: async (_, input) => { rows.set(input.requestKey, { ...input, state: "pending", origin: "reserved", unknownReasons: [], conflicts: [] }); return { acquired: true }; },
    settle: async (_, key, evidence) => { rows.set(key, { ...rows.get(key)!, state: "settled", evidence }); },
    markUnknown: async (_, key, reason) => { rows.set(key, { ...rows.get(key)!, state: "unknown", unknownReasons: [reason] }); },
  };
  const store: RetainedPurchaseStore = { get: async (_, key) => retained.get(key) ?? null,
    put: async (_, key, value) => { retained.set(key, value); } };
  return { ledger, store, rows, retained };
}

describe("explicit two-provider visual review", () => {
  it("pins the requested roles and efforts without changing historical questions", () => {
    expect(visualReviewPolicy("scene-quality")).toMatchObject({ model: "claude-opus-5-5", provider: "anthropic", effort: "high" });
    expect(visualReviewPolicy("head-continuity")).toMatchObject({ model: "gpt-6.1-sol", provider: "openai", effort: "high" });
    expect(visualReviewPolicy("scene-quality", "medium").effort).toBe("medium");
    expect(localPatchBoardJudgeSettings(12).model).toBe("gpt-5.6-sol");
    const q = question(), fingerprint = prepareVisualReview(q).fingerprint;
    for (const changed of [{ ...q, effort: "high" as const }, { ...q, role: "head-continuity" as const }, { ...q, labels: ["different"] }, { ...q, images: [Buffer.from("different")] }])
      expect(prepareVisualReview(changed).fingerprint).not.toBe(fingerprint);
  });
  it("charges MED/HIGH at the same token rates and treats absent cache-write data conservatively", () => {
    for (const effort of ["medium", "high"] as const) {
      expect(visualReviewCharge(visualReviewPolicy("scene-quality", effort), "claude-opus-5-5", { input_tokens: 1000, output_tokens: 500 }))
        .toEqual({ costCents: 1.4, costUnknown: false });
      expect(visualReviewCharge(visualReviewPolicy("head-continuity", effort), "gpt-6.1-sol", { prompt_tokens: 1000, completion_tokens: 500 }))
        .toEqual({ costCents: 0.75, costUnknown: false });
      expect(visualReviewCharge(visualReviewPolicy("head-continuity", effort), "gpt-6.1-sol", { prompt_tokens: 1000, completion_tokens: 500,
        prompt_tokens_details: { cached_tokens: 100, cache_write_tokens: 200 } })).toEqual({ costCents: 0.691, costUnknown: false });
    }
  });
  it("adds Claude cache counters instead of subtracting them from ordinary input", () => {
    expect(visualReviewCharge(visualReviewPolicy("scene-quality"), "claude-opus-5-5", { input_tokens: 1000, output_tokens: 500,
      cache_read_input_tokens: 100, cache_creation_input_tokens: 300, cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 } }))
      .toEqual({ costCents: 1.612, costUnknown: false });
  });
  it("keeps wrong-model, malformed, regional, long-context and unexpected tool charges unknown", () => {
    const opus = visualReviewPolicy("scene-quality"), sol = visualReviewPolicy("head-continuity");
    for (const usage of [null, {}, { input_tokens: -1, output_tokens: 0 }, { input_tokens: 1, output_tokens: 1, cache_creation: "bad" },
      { input_tokens: 1, output_tokens: 1, service_tier: "priority" }, { input_tokens: 1, output_tokens: 1, inference_geo: "us" },
      { input_tokens: 1, output_tokens: 1, server_tool_use: { web_search_requests: 1 } }, { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1 }])
      expect(visualReviewCharge(opus, opus.model, usage).costUnknown).toBe(true);
    expect(visualReviewCharge(opus, "claude-opus-5", { input_tokens: 1, output_tokens: 1 }).costUnknown).toBe(true);
    for (const usage of [{ prompt_tokens: 272001, completion_tokens: 1 }, { prompt_tokens: 1, completion_tokens: 1, prompt_tokens_details: "bad" },
      { prompt_tokens: 1, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 2 } }])
      expect(visualReviewCharge(sol, sol.model, usage).costUnknown).toBe(true);
  });
  it("dispatches Opus with adaptive thinking, adjacent labels, the exact effort and no hidden retry", async () => {
    const fetcher = vi.fn(async () => response(opusBody()));
    const reply = await requestVisualReview("synthetic-key", { ...question(), effort: "high" }, fetcher);
    expect(reply).toMatchObject({ model: "claude-opus-5-5", raw: '{"cases":[]}', wireFault: null, costUnknown: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(call[0]).toBe("https://api.anthropic.com/v1/messages");
    expect(body).toMatchObject({ model: "claude-opus-5-5", thinking: { type: "adaptive" }, output_config: { effort: "high" }, service_tier: "standard_only" });
    expect(body.messages[0].content.map((v: { type: string }) => v.type)).toEqual(["text", "text", "image"]);
    expect(reply.raw).not.toContain("not exposed");
  });
  it("dispatches Sol 6.1 HIGH and rejects a wrong model or truncated answer", async () => {
    const fetcher = vi.fn(async () => response({ model: "gpt-6.1-sol", choices: [{ message: { content: '{}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1000, completion_tokens: 500 } }));
    expect(await requestVisualReview("synthetic-key", { ...question("head-continuity"), effort: "high" }, fetcher)).toMatchObject({ wireFault: null, costUnknown: false });
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(call[1].body as string)).toMatchObject({ model: "gpt-6.1-sol", reasoning_effort: "high", store: false });
    for (const [over, fault] of [[{ model: "claude-opus-5" }, "wrong-model"], [{ stop_reason: "max_tokens" }, "truncated"]] as const)
      expect(await requestVisualReview("synthetic-key", question(), async () => response(opusBody(over)))).toMatchObject({ wireFault: fault });
  });
  it("retains charges even when the answer cannot be used and does not invent a free timeout", async () => {
    const f = purchaseFixture(), fetcher = vi.fn(async () => response(opusBody({ stop_reason: "max_tokens" })));
    const input = { worldId: "test-world", requestKey: "review-opus-medium-v1", reserveMicroUsd: 300_000, question: question() };
    const deps = { ...f, apiKey: "synthetic-key", fetchOnce: fetcher };
    const first = await buyVisualReview(deps, input);
    expect(first.kind).toBe("bought");
    expect(await buyVisualReview(deps, input)).toMatchObject({ kind: "bought", replayed: true });
    expect(await buyVisualReview(deps, { ...input, question: { ...input.question, effort: "high" } })).toMatchObject({ kind: "unresolved" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const lost = vi.fn(async () => { throw Error("connection lost"); });
    expect(await buyVisualReview({ ...deps, fetchOnce: lost }, { ...input, requestKey: "lost" })).toMatchObject({ kind: "unresolved" });
    expect(f.rows.get("lost")).toMatchObject({ state: "unknown" });
    expect(lost).toHaveBeenCalledTimes(1);
  });
  it("rejects missing credentials and malformed evidence before reserving or calling", async () => {
    const f = purchaseFixture(), reserve = vi.spyOn(f.ledger, "reserve"), fetcher = vi.fn();
    const input = { worldId: "test-world", requestKey: "review", reserveMicroUsd: 300_000, question: question() };
    await expect(buyVisualReview({ ...f, apiKey: "", fetchOnce: fetcher }, input)).rejects.toThrow("ANTHROPIC_API_KEY");
    await expect(buyVisualReview({ ...f, apiKey: "synthetic", fetchOnce: fetcher }, { ...input, question: { ...input.question, labels: [] } })).rejects.toThrow("evidence");
    expect(reserve).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps the timeout armed through a stalled Claude response body", async () => {
    const fetcher: typeof fetch = async (_url, init) => ({ ok: true, headers: new Headers({ "request-id": "req-stalled" }),
      json: () => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(Error("aborted")))) } as Response);
    const q = question();
    const result = await requestAnthropicVisualReview("synthetic", { prompt: q.prompt, images: q.images, imageLabels: q.labels, effort: "medium", timeoutMs: 10 }, fetcher);
    expect(result).toMatchObject({ wireFault: "timeout", costUnknown: true });
  });
});
