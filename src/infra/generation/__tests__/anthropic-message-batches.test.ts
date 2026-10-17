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
const counts = (succeeded: number, rest: Partial<Record<"processing" | "errored" | "canceled" | "expired", number>> = {}) =>
  ({ processing: 0, succeeded, errored: 0, canceled: 0, expired: 0, ...rest });
const ended = (id: string, createdAt: string, status = "ended", requests = counts(1)) =>
  ({ id, created_at: createdAt, processing_status: status, request_counts: status === "ended" ? requests : counts(0, { processing: 1 }) });
const line = (customId: string, result: unknown) => JSON.stringify({ custom_id: customId, result });
/**
 * The synchronous Opus request exactly as it was sent before Message Batches
 * existed (921cf306), written out by hand rather than derived from the helper both
 * routes now share: a change to that helper must fail here, not move both sides.
 */
const HISTORICAL_SYNC_BODY = `{"model":"claude-opus-5-5","max_tokens":6500,"service_tier":"standard_only","output_config":{"effort":"high"},`
  + `"thinking":{"type":"adaptive"},"messages":[{"role":"user","content":[{"type":"text","text":"Inspect the hide."},`
  + `{"type":"text","text":"first"},{"type":"image","source":{"type":"base64","media_type":"image/png","data":"cG5nLW9uZQ=="}},`
  + `{"type":"text","text":"second"},{"type":"image","source":{"type":"base64","media_type":"image/png","data":"cG5nLXR3bw=="}}]}]}`;

describe("Anthropic Message Batches transport", () => {
  it("sends the synchronous Opus body without its tier, and the synchronous route still sends its historical bytes", async () => {
    const params = anthropicVisualReviewBody(request, null);
    expect(params).not.toHaveProperty("service_tier");
    const fetcher = wire(reply(200, { id: "msgbatch_abc", processing_status: "in_progress" }));
    await expect(new AnthropicMessageBatches("synthetic", fetcher).create([{ customId: "q1", params }])).resolves.toEqual({ batchId: "msgbatch_abc" });
    const { url, init, body } = sent(fetcher);
    expect(url).toBe("https://api.anthropic.com/v1/messages/batches");
    expect(init).toMatchObject({ method: "POST", redirect: "error", headers: { "x-api-key": "synthetic", "anthropic-version": "2023-06-01" } });
    expect(body).toEqual({ requests: [{ custom_id: "q1", params }] });
    // Byte for byte, the request the synchronous route has always sent; the batch carries it without its tier.
    const sync = wire(reply(200, { id: "msg_1", model: POLICY.model, content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }));
    await requestAnthropicVisualReview("synthetic", request, sync);
    expect(sent(sync).init.body).toBe(HISTORICAL_SYNC_BODY);
    const { service_tier: tier, ...untiered } = JSON.parse(HISTORICAL_SYNC_BODY);
    expect([tier, JSON.stringify(params)]).toEqual(["standard_only", JSON.stringify(untiered)]);
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
    const page1 = { data: [ended("msgbatch_new", at(30)), ended("msgbatch_mine", at(5), "ended", counts(1, { canceled: 1 }))], has_more: true, last_id: "msgbatch_mine" };
    const page2 = { data: [ended("msgbatch_old", new Date(since - QUALITY_BATCH_CLOCK_SKEW_MS - 1).toISOString())], has_more: true, last_id: "msgbatch_old" };
    const fetcher = wire(reply(200, page1), reply(200, null, line("q-other", { type: "succeeded", message: {} })),
      reply(200, null, [line("q-mine", { type: "succeeded", message: {} }), line("q-x", { type: "canceled" })].join("\n")), reply(200, page2));
    await expect(new AnthropicMessageBatches("synthetic", fetcher).find("q-mine", since)).resolves.toMatchObject({ proven: ["msgbatch_mine"], undecided: false });
    // Pages by the documented cursor; reads results from the documented path, never a supplied URL; stops at the intent.
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.anthropic.com/v1/messages/batches?limit=1000",
      "https://api.anthropic.com/v1/messages/batches/msgbatch_new/results",
      "https://api.anthropic.com/v1/messages/batches/msgbatch_mine/results",
      "https://api.anthropic.com/v1/messages/batches?limit=1000&after_id=msgbatch_mine"]);
    const running = wire(reply(200, { data: [ended("msgbatch_run", at(1), "in_progress")], has_more: false }));
    await expect(new AnthropicMessageBatches("synthetic", running).find("q-mine", since)).resolves.toMatchObject({ proven: [], undecided: true });
    const unreadable = wire(reply(503, { type: "error", error: { type: "api_error" } }));
    await expect(new AnthropicMessageBatches("synthetic", unreadable).find("q-mine", since)).rejects.toThrow("list answered 503");
  });

  it("leaves out batches created after the window: a newer one, running or ended, neither proves nor keeps the search undecided", async () => {
    const since = Date.parse("2026-10-16T08:00:00.000Z"), at = (minutes: number) => new Date(since + minutes * 60_000).toISOString(), until = since + 20 * 60_000;
    // Codex's case: unrelated batches keep running in the workspace, every one created after the question's window.
    const page = { data: [ended("msgbatch_newrun", at(90), "in_progress"), ended("msgbatch_newend", at(60)), ended("msgbatch_mine", at(5))], has_more: false };
    const fetcher = wire(reply(200, page), reply(200, null, line("q-mine", { type: "succeeded", message: {} })));
    await expect(new AnthropicMessageBatches("synthetic", fetcher).find("q-mine", since, undefined, until)).resolves.toMatchObject({ proven: ["msgbatch_mine"], undecided: false });
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(["https://api.anthropic.com/v1/messages/batches?limit=1000",
      "https://api.anthropic.com/v1/messages/batches/msgbatch_mine/results"]);
    // Within the clocks' allowance, a batch created just after the window is still a candidate.
    const edge = wire(reply(200, { data: [ended("msgbatch_edge", new Date(until + QUALITY_BATCH_CLOCK_SKEW_MS).toISOString(), "in_progress")], has_more: false }));
    await expect(new AnthropicMessageBatches("synthetic", edge).find("q-mine", since, undefined, until)).resolves.toMatchObject({ proven: [], undecided: true });
  });

  it("reads only batches the round does not know yet: a known one, proven already, is neither read again nor kept undecided", async () => {
    const since = Date.parse("2026-10-16T08:00:00.000Z"), at = (minutes: number) => new Date(since + minutes * 60_000).toISOString();
    // Codex's eleventh-pass case: a known copy whose results cannot be read would otherwise sink every search.
    const page = { data: [ended("msgbatch_new", at(9)), ended("msgbatch_known", at(5)), ended("msgbatch_knownrunning", at(4), "in_progress")], has_more: false };
    const fetcher = wire(reply(200, page), reply(200, null, line("q-mine", { type: "succeeded", message: {} })));
    // What proved the new batch comes back with it (Codex's twelfth pass: it is the batch's first reading), and nothing else does.
    await expect(new AnthropicMessageBatches("synthetic", fetcher).find("q-mine", since, undefined, undefined, new Set(["msgbatch_known", "msgbatch_knownrunning"])))
      .resolves.toEqual({ proven: ["msgbatch_new"], undecided: false, results: { msgbatch_new: [{ customId: "q-mine", type: "succeeded", message: {} }] }, pending: [], cleared: [] });
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(["https://api.anthropic.com/v1/messages/batches?limit=1000",
      "https://api.anthropic.com/v1/messages/batches/msgbatch_new/results"]);
  });

  it("keeps what a search proved when a later read fails: the proven batch comes back with its results, undecided, saying why (Codex's thirteenth pass)", async () => {
    const since = Date.parse("2026-10-16T08:00:00.000Z"), at = (minutes: number) => new Date(since + minutes * 60_000).toISOString();
    // Codex's case: batch A's results prove the question; reading candidate B's then answers 503.
    const page = { data: [ended("msgbatch_a", at(9)), ended("msgbatch_b", at(5))], has_more: false };
    const proving = line("q-mine", { type: "succeeded", message: { id: "msg_priced" } }), unavailable = { type: "error", error: { type: "api_error" } };
    const fetcher = wire(reply(200, page), reply(200, null, proving), reply(503, unavailable));
    // B, whose read failed, could carry the question too: it is named, undecided (Codex's fifteenth pass).
    await expect(new AnthropicMessageBatches("synthetic", fetcher).find("q-mine", since)).resolves.toEqual({ proven: ["msgbatch_a"], undecided: true,
      results: { msgbatch_a: [{ customId: "q-mine", type: "succeeded", message: { id: "msg_priced" } }] }, pending: ["msgbatch_b"], cleared: [],
      failed: "QUALITY_BATCH: results of msgbatch_b answered 503" });
    // A search that proved nothing before it failed names the batch it could not read, undecided: absence is never inferred.
    const nothing = wire(reply(200, { data: [ended("msgbatch_b", at(5)), ended("msgbatch_a", at(4))], has_more: false }), reply(503, unavailable));
    await expect(new AnthropicMessageBatches("synthetic", nothing).find("q-mine", since)).resolves.toEqual({ proven: [], undecided: true, results: {},
      pending: ["msgbatch_b"], cleared: [], failed: "QUALITY_BATCH: results of msgbatch_b answered 503" });
    // One that failed before it saw any batch throws, as before.
    const blind = wire(reply(503, unavailable));
    await expect(new AnthropicMessageBatches("synthetic", blind).find("q-mine", since)).rejects.toThrow("list answered 503");
  });

  it("names every batch it could not decide, and clears a watched one only by reading it or by listing the whole window without it (Codex's fifteenth pass)", async () => {
    const since = Date.parse("2026-10-16T08:00:00.000Z"), at = (minutes: number) => new Date(since + minutes * 60_000).toISOString();
    // Watched: one now ended without the question, one still running, one no longer listed, and one ended with it; and an
    // unwatched one ended without the question, which is nobody's to clear.
    const watch = new Set(["msgbatch_wother", "msgbatch_wrun", "msgbatch_wgone", "msgbatch_wmine"]);
    const page = { data: [ended("msgbatch_wother", at(9)), ended("msgbatch_unrelated", at(8)), ended("msgbatch_wrun", at(8), "in_progress"),
      ended("msgbatch_run", at(7), "in_progress"), ended("msgbatch_wmine", at(6))], has_more: false };
    const other = line("q-other", { type: "succeeded", message: {} });
    const fetcher = wire(reply(200, page), reply(200, null, other), reply(200, null, other), reply(200, null, line("q-mine", { type: "succeeded", message: {} })));
    await expect(new AnthropicMessageBatches("synthetic", fetcher).find("q-mine", since, undefined, undefined, undefined, watch)).resolves.toEqual({
      proven: ["msgbatch_wmine"], undecided: true, results: { msgbatch_wmine: [{ customId: "q-mine", type: "succeeded", message: {} }] },
      pending: ["msgbatch_wrun", "msgbatch_run"], cleared: ["msgbatch_wother", "msgbatch_wgone"] });
    // A listing cut off before the window's end clears nothing by absence: the second page answers 503.
    const cut = wire(reply(200, { data: [ended("msgbatch_wother", at(9))], has_more: true, last_id: "msgbatch_wother" }),
      reply(200, null, line("q-other", { type: "succeeded", message: {} })), reply(503, { type: "error", error: { type: "api_error" } }));
    await expect(new AnthropicMessageBatches("synthetic", cut).find("q-mine", since, undefined, undefined, undefined, watch)).rejects.toThrow("list answered 503");
    const cutRunning = wire(reply(200, { data: [ended("msgbatch_wother", at(9)), ended("msgbatch_run", at(8), "in_progress")], has_more: true, last_id: "msgbatch_run" }),
      reply(200, null, line("q-other", { type: "succeeded", message: {} })), reply(503, { type: "error", error: { type: "api_error" } }));
    await expect(new AnthropicMessageBatches("synthetic", cutRunning).find("q-mine", since, undefined, undefined, undefined, watch)).resolves.toEqual({
      proven: [], undecided: true, results: {}, pending: ["msgbatch_run"], cleared: ["msgbatch_wother"], failed: "QUALITY_BATCH: list answered 503 without a complete page" });
    // Out of time before an ended batch's results: that batch is named, and nothing is cleared by absence.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t0 = since + 3_600_000; vi.setSystemTime(t0);
      const late = vi.fn<typeof fetch>(async () => { vi.setSystemTime(Date.now() + 29_000); return reply(200, { data: [ended("msgbatch_wother", at(9))], has_more: false }); });
      await expect(new AnthropicMessageBatches("synthetic", late).find("q-mine", since, t0 + 50_000, undefined, undefined, watch)).resolves.toEqual({
        proven: [], undecided: true, truncated: true, results: {}, pending: ["msgbatch_wother"], cleared: [] });
      expect(late).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("never infers absence from an incomplete answer: an empty or cut-off result file, a page without its end, a promise without a cursor", async () => {
    const since = Date.parse("2026-10-16T08:00:00.000Z"), at = new Date(since + 60_000).toISOString();
    const search = (...answers: Response[]) => new AnthropicMessageBatches("synthetic", wire(...answers)).find("q-mine", since);
    const other = line("q-other", { type: "succeeded", message: {} });
    // Each is undecided, naming the batch it could not decide and saying why; none proves anything absent.
    const undecidedOver = (reason: string) => ({ proven: [], undecided: true, pending: ["msgbatch_1"], cleared: [], failed: expect.stringContaining(reason) });
    // The batch counts one answered request; its results arrive empty, or as a prefix without it.
    await expect(search(reply(200, { data: [ended("msgbatch_1", at)], has_more: false }), reply(200, null, ""))).resolves.toMatchObject(undecidedOver("do not match its record"));
    await expect(search(reply(200, { data: [ended("msgbatch_1", at, "ended", counts(2))], has_more: false }), reply(200, null, other))).resolves.toMatchObject(undecidedOver("do not match its record"));
    // Two lines for one id are not two results, even of the counted type.
    await expect(search(reply(200, { data: [ended("msgbatch_1", at, "ended", counts(2))], has_more: false }),
      reply(200, null, [other, other].join("\n")))).resolves.toMatchObject(undecidedOver("do not match its record"));
    // A batch record that does not state its counts, or still counts one processing.
    await expect(search(reply(200, { data: [{ ...ended("msgbatch_1", at), request_counts: undefined }], has_more: false }))).resolves.toMatchObject(undecidedOver("request counts"));
    await expect(search(reply(200, { data: [ended("msgbatch_1", at, "ended", counts(1, { processing: 1 }))], has_more: false }))).resolves.toMatchObject(undecidedOver("request counts"));
    // A page that does not say whether more follow, or promises more without a cursor: with no batch seen, a throw.
    await expect(search(reply(200, { data: [] }))).rejects.toThrow("complete page");
    await expect(search(reply(200, { data: [ended("msgbatch_1", at, "in_progress")], has_more: true }))).resolves.toMatchObject(undecidedOver("promised more"));
    await expect(search(reply(200, { data: [], has_more: true, last_id: "msgbatch_1" }))).rejects.toThrow("promised more");
    // The same file, whole, proves the question absent.
    await expect(search(reply(200, { data: [ended("msgbatch_1", at)], has_more: false }), reply(200, null, other))).resolves.toMatchObject({ proven: [], undecided: false });
  });

  it("refuses results whose types contradict the batch's own counts: a counted success is never read as unbilled", async () => {
    const record = (requestCounts: Record<string, number>) => ({ id: "msgbatch_1", processing_status: "ended", request_counts: requestCounts });
    const results = (...answers: Response[]) => new AnthropicMessageBatches("synthetic", wire(...answers)).results("msgbatch_1");
    const errored = { type: "errored", error: { type: "error", error: { type: "api_error", message: "x" } } };
    // Codex's case: one counted success, returned as canceled (or expired, or errored).
    for (const result of [{ type: "canceled" }, { type: "expired" }, errored])
      await expect(results(reply(200, record(counts(1))), reply(200, null, line("q-mine", result)))).rejects.toThrow(/do not match its record.*succeeded/);
    // The other way round, a type the record does not count at all, and one more line of such a type.
    await expect(results(reply(200, record(counts(0, { canceled: 1 }))), reply(200, null, line("q-mine", { type: "succeeded", message: {} })))).rejects.toThrow("do not match its record");
    await expect(results(reply(200, record(counts(1))), reply(200, null, line("q-mine", { type: "mystery" })))).rejects.toThrow("do not match its record");
    await expect(results(reply(200, record(counts(1))), reply(200, null, [line("q-mine", { type: "succeeded", message: {} }), line("q-x", { type: "mystery" })].join("\n"))))
      .rejects.toThrow("do not match its record");
    // The search refuses the same contradiction rather than read it as proof: the batch stays undecided, named.
    const since = Date.parse("2026-10-16T08:00:00.000Z"), at = new Date(since + 60_000).toISOString();
    await expect(new AnthropicMessageBatches("synthetic", wire(reply(200, { data: [ended("msgbatch_1", at)], has_more: false }),
      reply(200, null, line("q-mine", { type: "canceled" })))).find("q-mine", since)).resolves.toMatchObject({ proven: [], undecided: true,
      pending: ["msgbatch_1"], failed: expect.stringContaining("do not match its record") });
    // Matching types, in any order, are read.
    await expect(results(reply(200, record(counts(1, { canceled: 1 }))), reply(200, null, [line("q-x", { type: "canceled" }), line("q-mine", { type: "succeeded", message: {} })].join("\n"))))
      .resolves.toHaveLength(2);
  });

  it("starts no read that could end after the caller's deadline", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t0 = Date.parse("2026-10-16T09:00:00.000Z"); vi.setSystemTime(t0);
      const since = t0 - 3_600_000, at = new Date(t0 - 60_000).toISOString(), starts: number[] = [];
      // Codex's case: one page of ten ended batches, and every answer takes 29 seconds.
      const answers = [reply(200, { data: Array.from({ length: 10 }, (_, i) => ended(`msgbatch_s${i}`, at)), has_more: false }),
        ...Array.from({ length: 10 }, () => reply(200, null, line("q-other", { type: "succeeded", message: {} })))];
      const slow = vi.fn<typeof fetch>(async () => { starts.push(Date.now()); vi.setSystemTime(Date.now() + 29_000); return answers.shift()!; });
      const deadlineAt = t0 + 240_000;
      await expect(new AnthropicMessageBatches("synthetic", slow).find("q-mine", since, deadlineAt)).resolves.toMatchObject({ proven: [], undecided: true, truncated: true });
      expect(starts.length).toBe(8);
      expect(starts.every(start => deadlineAt - start >= 30_000)).toBe(true);
      // Page after page of batches still running: the next page is asked for only with room for it.
      const pageStarts: number[] = [];
      const pages = vi.fn<typeof fetch>(async () => {
        pageStarts.push(Date.now()); vi.setSystemTime(Date.now() + 29_000);
        return reply(200, { data: [ended(`msgbatch_p${pageStarts.length}`, at, "in_progress")], has_more: true, last_id: `msgbatch_p${pageStarts.length}` });
      });
      const pagesDeadline = Date.now() + 100_000;
      await expect(new AnthropicMessageBatches("synthetic", pages).find("q-mine", since, pagesDeadline)).resolves.toMatchObject({ proven: [], undecided: true, truncated: true });
      expect(pageStarts.length).toBe(3);
      expect(pageStarts.every(start => pagesDeadline - start >= 30_000)).toBe(true);
      // A batch's results are two reads, its record and its file: each starts only with room for its timeout.
      const record = vi.fn<typeof fetch>(async () => { vi.setSystemTime(Date.now() + 29_000); return reply(200, { id: "msgbatch_1", processing_status: "ended", request_counts: counts(1) }); });
      await expect(new AnthropicMessageBatches("synthetic", record).results("msgbatch_1", Date.now() + 40_000)).rejects.toThrow("too little time");
      expect(record).toHaveBeenCalledTimes(1);
      // With 29 seconds left neither read starts, whether the record is still to be read or its counts are in hand.
      const none = vi.fn<typeof fetch>();
      await expect(new AnthropicMessageBatches("synthetic", none).results("msgbatch_1", Date.now() + 29_000)).rejects.toThrow("too little time");
      await expect(new AnthropicMessageBatches("synthetic", none).results("msgbatch_1", Date.now() + 29_000, counts(1))).rejects.toThrow("too little time");
      expect(none).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("says when a search ran out of pages before the intent: undecided, and truncated", async () => {
    const since = Date.parse("2026-10-16T08:00:00.000Z"), at = new Date(since + 60_000).toISOString();
    const pages = Array.from({ length: 20 }, (_, i) => reply(200, { data: [ended(`msgbatch_p${i}`, at, "in_progress")], has_more: true, last_id: `msgbatch_p${i}` }));
    const fetcher = wire(...pages);
    await expect(new AnthropicMessageBatches("synthetic", fetcher).find("q-mine", since)).resolves.toMatchObject({ proven: [], undecided: true, truncated: true });
    expect(fetcher).toHaveBeenCalledTimes(20);
  });

  it("reads every documented result type and keeps an unknown one as unrecognised, only from an ended batch whose counts it matches", async () => {
    // A result type this code does not know, counted by the batch under its own name.
    const record = { id: "msgbatch_1", processing_status: "ended", request_counts: { ...counts(1, { errored: 1, canceled: 1, expired: 1 }), mystery: 1 } };
    const file = [line("a", { type: "succeeded", message: { id: "msg_a" } }),
      line("b", { type: "errored", error: { type: "error", error: { type: "invalid_request_error", message: "x" } } }),
      line("c", { type: "canceled" }), line("d", { type: "expired" }), line("e", { type: "mystery" })].join("\n") + "\n";
    const fetcher = wire(reply(200, record), reply(200, null, file));
    await expect(new AnthropicMessageBatches("synthetic", fetcher).results("msgbatch_1")).resolves.toEqual([
      { customId: "a", type: "succeeded", message: { id: "msg_a" } }, { customId: "b", type: "errored", errorType: "invalid_request_error" },
      { customId: "c", type: "canceled" }, { customId: "d", type: "expired" }, { customId: "e", type: "unrecognized", resultType: "mystery" }]);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(["https://api.anthropic.com/v1/messages/batches/msgbatch_1",
      "https://api.anthropic.com/v1/messages/batches/msgbatch_1/results"]);
    const results = (...answers: Response[]) => new AnthropicMessageBatches("synthetic", wire(...answers)).results("msgbatch_1");
    const one = { id: "msgbatch_1", processing_status: "ended", request_counts: counts(1) };
    await expect(results(reply(200, one), reply(200, null, "{broken"))).rejects.toThrow("unreadable result line");
    await expect(results(reply(200, one), reply(200, null, ""))).rejects.toThrow("do not match its record");
    await expect(results(reply(200, { ...one, processing_status: "canceling" }))).rejects.toThrow("ended record");
    await expect(results(reply(200, { ...one, id: "msgbatch_2" }))).rejects.toThrow("ended record");
  });

  it("reads status, cancels, and counts a deletion only when it is acknowledged", async () => {
    const fetcher = wire(reply(200, { id: "msgbatch_1", processing_status: "canceling" }), reply(200, { id: "msgbatch_1", processing_status: "canceling" }),
      reply(200, { id: "msgbatch_1", type: "message_batch_deleted" }), reply(404, { type: "error", error: { type: "not_found_error" } }), reply(200, { id: "msgbatch_1" }));
    const batches = new AnthropicMessageBatches("synthetic", fetcher);
    await expect(batches.status("msgbatch_1")).resolves.toEqual({ status: "canceling", counts: null });
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

  it("reads an ended batch in two calls: its status carries the counts its results are checked against", async () => {
    const record = { id: "msgbatch_1", processing_status: "ended", request_counts: counts(1, { canceled: 1 }) };
    const file = [line("q-mine", { type: "succeeded", message: {} }), line("q-x", { type: "canceled" })].join("\n");
    const fetcher = wire(reply(200, record), reply(200, null, file)), batches = new AnthropicMessageBatches("synthetic", fetcher);
    const status = await batches.status("msgbatch_1");
    expect(status).toEqual({ status: "ended", counts: counts(1, { canceled: 1 }) });
    await expect(batches.results("msgbatch_1", undefined, status.counts!)).resolves.toHaveLength(2);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(["https://api.anthropic.com/v1/messages/batches/msgbatch_1",
      "https://api.anthropic.com/v1/messages/batches/msgbatch_1/results"]);
    // The counts are checked exactly as if the record had been read again.
    await expect(new AnthropicMessageBatches("synthetic", wire(reply(200, null, line("q-mine", { type: "canceled" })))).results("msgbatch_1", undefined, counts(1)))
      .rejects.toThrow(/do not match its record.*succeeded/);
    // An ended record that does not state every count gives none, and the results then read the record themselves.
    await expect(new AnthropicMessageBatches("synthetic", wire(reply(200, { ...record, request_counts: { succeeded: 1 } }))).status("msgbatch_1"))
      .resolves.toEqual({ status: "ended", counts: null });
    // With the counts in hand, 31 seconds left is room for the one read the results still need.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const slow = vi.fn<typeof fetch>(async () => { vi.setSystemTime(Date.now() + 29_000); return reply(200, null, line("q-mine", { type: "succeeded", message: {} })); });
      await expect(new AnthropicMessageBatches("synthetic", slow).results("msgbatch_1", Date.now() + 31_000, counts(1))).resolves.toHaveLength(1);
      expect(slow).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
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
