import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { OpenAiPatchJudge, judgeCharge, judgePrompt, judgeReserveCents } from "../judge";

let png: Buffer;
beforeAll(async () => { png = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#bb8866" } }).png().toBuffer(); });
afterEach(() => vi.unstubAllGlobals());
const input = () => ({ patchPng: png, reference: png, childName: "test-child", label: "test-cell" });
const usage = { prompt_tokens: 17370, completion_tokens: 20 };
function response(content = '{"verdict":"ok","reason":"same face"}', withUsage = true) {
  return new Response(JSON.stringify({ model: "gpt-4o-mini-2024-07-18", choices: [{ message: { content } }], ...(withUsage ? { usage } : {}) }), { headers: { "x-request-id": "req_test" } });
}

describe("judge billing and evidence", () => {
  it("records exact rate-based cost, usage, request id, served model and unchanged prompt", async () => {
    const fetch = vi.fn().mockResolvedValue(response()); vi.stubGlobal("fetch", fetch);
    const result = await new OpenAiPatchJudge("test-key", { tries: 1 }).judge(input());
    expect(result.costCents).toBeCloseTo(0.26175, 6);
    expect(result.costUnknown).toBe(false);
    expect(result.attempts?.[0]).toMatchObject({ requestId: "req_test", usage, model: "gpt-4o-mini-2024-07-18" });
    expect(result.promptSent).toBe(judgePrompt("test-child"));
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.max_tokens).toBe(60);
    expect(body.messages[0].content[0].text).toBe(result.promptSent);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not turn a successful answer without usage into a free call", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(undefined, false)));
    expect(await new OpenAiPatchJudge("test-key", { tries: 1 }).judge(input())).toMatchObject({ verdict: "ok", costUnknown: true, costCents: 0 });
  });
  it("a single-attempt experiment does not retry an invalid verdict", async () => {
    const fetch = vi.fn().mockResolvedValue(response("not json")); vi.stubGlobal("fetch", fetch);
    const result = await new OpenAiPatchJudge("test-key", { tries: 1 }).judge(input());
    expect(result.verdict).toBe("unknown");
    expect(result.costCents).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("counts both paid attempts when a production retry is needed", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response("not json")).mockResolvedValueOnce(response()); vi.stubGlobal("fetch", fetch);
    const result = await new OpenAiPatchJudge("test-key").judge(input());
    expect(result.verdict).toBe("ok");
    expect(result.costCents).toBeCloseTo(0.5235, 6);
    expect(result.attempts).toHaveLength(2);
  });
  it.each(["timeout", "bad-json", "null-json", "http-error"])("stops on ambiguous %s charges without retrying", async (kind) => {
    const fetch = vi.fn();
    if (kind === "timeout") fetch.mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    else if (kind === "bad-json") fetch.mockResolvedValue(new Response("{broken"));
    else if (kind === "null-json") fetch.mockResolvedValue(new Response("null"));
    else fetch.mockResolvedValue(new Response('{"error":{"message":"upstream failed"}}', { status: 502 }));
    vi.stubGlobal("fetch", fetch);
    const result = await new OpenAiPatchJudge("test-key").judge(input());
    expect(result).toMatchObject({ verdict: "unknown", costUnknown: true });
    expect(result.attempts).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("refuses to guess pricing for another mini model or incomplete usage", () => {
    expect(judgeCharge("unknown-mini", usage).costUnknown).toBe(true);
    expect(judgeCharge("gpt-4o-mini", { prompt_tokens: 30 }).costUnknown).toBe(true);
    expect(judgeCharge("gpt-4o-mini", { prompt_tokens: -1, completion_tokens: 0 }).costUnknown).toBe(true);
    expect(() => judgeReserveCents("gpt-4.1-mini", "test")).toThrow(/priced only/);
  });
  it("reserves above recorded usage without assuming a cache discount", () => {
    expect(judgeReserveCents("gpt-4o-mini", "noa")).toBeGreaterThan(judgeCharge("gpt-4o-mini", usage).costCents);
    expect(judgeReserveCents("gpt-4o-mini", "noa")).toBeLessThan(0.3);
  });
});
