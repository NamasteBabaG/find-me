import { beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { BudgetedOpenAiFixedSourceProvider, prepareFixedSource, type FixedSourcePolicy } from "../openai-fixed-source";
import { WorldBudget, type WorldBudgetSnapshot } from "../../../services/generation/world-budget";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore, type VersionedWorldBudgetSnapshot } from "../../db/world-budget-repository";
import { fixedSourceFailureReceiptSchema, type FixedSourceFailureReceipt, type FixedSourceFailureSink } from "../fixed-source-diagnostics";

/** Test-only atomic backing; never used as production durability. */
class Store implements AtomicWorldBudgetStore {
  rows = new Map<string, VersionedWorldBudgetSnapshot>();
  failWrites = false;
  async read(id: string) { return structuredClone(this.rows.get(id) ?? null); }
  async insertIfAbsent(id: string, snapshot: WorldBudgetSnapshot) {
    if (this.failWrites) throw new Error("DB failure");
    if (this.rows.has(id)) return false;
    this.rows.set(id, { revision: 0, snapshot: structuredClone(snapshot) }); return true;
  }
  async compareAndSwap(id: string, revision: number, snapshot: WorldBudgetSnapshot) {
    if (this.failWrites) throw new Error("DB failure");
    if (this.rows.get(id)?.revision !== revision) return false;
    this.rows.set(id, { revision: revision + 1, snapshot: structuredClone(snapshot) }); return true;
  }
}
const policy: FixedSourcePolicy = { reserveMicroUsd: 250_000, providerNamespace: "openai:test-project", timeoutMs: 1000,
  rateCard: { id: "reviewed-test-rates-v1", textInput: 5, imageInput: 8, imageOutput: 30 } };
let reference: Buffer, transparent: Buffer, opaque: Buffer;
beforeAll(async () => {
  reference = await sharp({ create: { width: 32, height: 32, channels: 4, background: "white" } }).png().toBuffer();
  opaque = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "white" } }).png().toBuffer();
  transparent = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#00000000" } })
    .composite([{ input: reference, top: 400, left: 400 }]).png().toBuffer();
});
function reply(extra: Record<string, unknown> = {}, status = 200, headers = { "x-request-id": "req-test-1" }) {
  return new Response(JSON.stringify({ model: "gpt-image-2", usage: { input_tokens: 30, output_tokens: 196,
    total_tokens: 226, input_tokens_details: { text_tokens: 10, image_tokens: 20 } },
  data: [{ b64_json: transparent.toString("base64") }], ...extra }), { status, headers });
}
async function fixture(custom: () => Promise<Response> = async () => reply(), selectedPolicy = policy, sink?: FixedSourceFailureSink) {
  const store = new Store(), budget = new WorldBudget(new CasWorldBudgetRepository(store));
  const fetchOnce = vi.fn(custom);
  const diagnostics: FixedSourceFailureReceipt[] = [];
  const provider = new BudgetedOpenAiFixedSourceProvider("not-a-live-credential", budget, selectedPolicy, fetchOnce as typeof fetch,
    async receipt => { diagnostics.push(receipt); await sink?.(receipt); });
  const source = { sourceGroupKey: "child-winter-standing-v1", prompt: "A complete illustrated child, no props.", stylePng: reference, identityPng: reference };
  const prepared = await prepareFixedSource(source, selectedPolicy);
  const input = { ...source, worldId: "game-world", requestKey: "source-attempt-1", expectedFingerprint: prepared.fingerprint };
  return { provider, budget, store, fetchOnce, input, diagnostics };
}

describe("budgeted fixed LOW image transport (no live API)", () => {
  it.each([
    [401, "invalid_api_key", "authentication_error"],
    [429, "insufficient_quota", "insufficient_quota"],
    [429, "rate_limit_exceeded", "rate_limit_error"],
    [403, "permission_denied", "permission_error"],
  ] as const)("persists classifiable %s/%s failure metadata, not response secrets", async (status, code, type) => {
    const secret = "sk" + "-proj-do-not-record-this-credential"; // Synthetic; avoid a credential-shaped source literal.
    const f = await fixture(async () => new Response(JSON.stringify({ error: { code, type, message: secret, param: secret }, prompt: secret,
      headers: { Authorization: secret }, data: [{ b64_json: secret }] }), { status, headers: { "x-request-id": "req_diagnostic_test" } }));
    await expect(f.provider.generate(f.input)).rejects.toMatchObject({ code: "cost_unknown", diagnosticStored: true,
      diagnostic: { httpStatus: status, providerErrorCode: code, providerErrorType: type, usage: { present: false, valid: false }, billing: "unknown" } });
    expect(f.diagnostics).toHaveLength(1);
    expect(f.diagnostics[0]).toMatchObject({ fingerprint: f.input.expectedFingerprint, requestId: "req_diagnostic_test", jsonStatus: "parsed" });
    expect(JSON.stringify(f.diagnostics)).not.toContain(secret);
    expect((await f.budget.audit(f.input.worldId)).reservedMicroUsd).toBe(250_000);
    expect(await f.provider.generate(f.input)).toMatchObject({ kind: "already-recorded" });
    expect(f.fetchOnce).toHaveBeenCalledTimes(1); expect(f.diagnostics).toHaveLength(1);
  });
  it.each([
    ["missing usage", { usage: undefined }, { present: false, valid: false }],
    ["invalid token", { usage: { input_tokens: "secret-value", output_tokens: 196, input_tokens_details: { text_tokens: 10, image_tokens: 20 } } }, { inputTokensInvalid: true, valid: false }],
    ["inconsistent totals", { usage: { input_tokens: 31, output_tokens: 196, input_tokens_details: { text_tokens: 10, image_tokens: 20 } } }, { inconsistentTotals: true, valid: false }],
    ["missing details", { usage: { input_tokens: 30, output_tokens: 196 } }, { detailsInvalid: true, valid: false }],
  ])("records bounded flags for %s without usage dumps", async (_name, override, expected) => {
    const f = await fixture(async () => reply(override as Record<string,unknown>));
    await expect(f.provider.generate(f.input)).rejects.toMatchObject({ code: "cost_unknown" });
    expect(f.diagnostics[0]?.usage).toMatchObject(expected);
    expect(JSON.stringify(f.diagnostics)).not.toContain("secret-value");
  });
  it("records model mismatch without retaining an arbitrary returned model/error string", async () => {
    const f = await fixture(async () => reply({ model: "sk" + "-proj-not-a-model-secret", error: { code: "raw-private-message", type: "raw-type" } }));
    await expect(f.provider.generate(f.input)).rejects.toMatchObject({ diagnostic: { returnedModel: "unexpected", providerErrorCode: "unrecognized", providerErrorType: "unrecognized" } });
    expect(JSON.stringify(f.diagnostics)).not.toMatch(/sk-proj|raw-private|raw-type/);
  });
  it("records safe HTTP/request metadata for a non-JSON failure", async () => {
    const f = await fixture(async () => new Response("secret server dump", { status: 503, headers: { "x-request-id": "req_unavailable" } }));
    await expect(f.provider.generate(f.input)).rejects.toMatchObject({ diagnostic: { reason: "response-not-json", jsonStatus: "invalid", httpStatus: 503, requestId: "req_unavailable" } });
    expect(JSON.stringify(f.diagnostics)).not.toContain("secret server dump");
  });
  it("drops unsafe request IDs without writing them to the charge ledger", async () => {
    const f = await fixture(async () => reply({ data: [] }, 500, { "x-request-id": "req_sk" + "-proj-secret-credential" }));
    await expect(f.provider.generate(f.input)).rejects.toMatchObject({ code: "cost_unknown", diagnostic: { billing: "unknown", httpStatus: 500, requestId: null, requestIdStatus: "invalid" } });
    expect(JSON.stringify(f.diagnostics)).not.toContain("req_sk-proj-secret");
    expect(JSON.stringify(f.store.rows.get(f.input.worldId))).not.toContain("req_sk-proj-secret");
    expect((await f.budget.audit(f.input.worldId)).settledMicroUsd).toBe(0);
  });
  it("retains known billing for a non-200 response with trustworthy usage and no image", async () => {
    const f = await fixture(async () => reply({ data: [] }, 500));
    await expect(f.provider.generate(f.input)).rejects.toMatchObject({ code: "invalid_output", diagnosticStored: true,
      diagnostic: { reason: "image-data", billing: "settled", httpStatus: 500, usage: { valid: true }, requestId: "req-test-1" } });
    expect((await f.budget.audit(f.input.worldId)).settledMicroUsd).toBe(6090);
  });
  it("classifies timeout without retaining exception text and keeps unknown billing when receipt storage fails", async () => {
    const f = await fixture(async () => { const e=new Error("private transport details");e.name="TimeoutError";throw e; }, policy, async () => { throw new Error("postgres://secret"); });
    await expect(f.provider.generate(f.input)).rejects.toMatchObject({ code: "cost_unknown", diagnosticStored: false, diagnostic: { reason: "transport", transport: "timeout", httpStatus: null, billing: "unknown" } });
    expect((await f.budget.audit(f.input.worldId)).held).toBe(true);expect(f.fetchOnce).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.diagnostics)).not.toMatch(/private transport|postgres/);
    expect(fixedSourceFailureReceiptSchema.safeParse({ ...f.diagnostics[0], message: "anything" }).success).toBe(false);
  });
  it("reserves before one request, pins all settings, settles exact microUSD and returns unapproved original PNG", async () => {
    const f = await fixture();
    f.fetchOnce.mockImplementation(async () => {
      expect((await f.budget.audit(f.input.worldId)).pendingRequestKeys).toEqual([f.input.requestKey]);
      return reply();
    });
    const result = await f.provider.generate(f.input);
    expect(result).toMatchObject({ kind: "generated", semanticApproval: "pending", evidence: { amountMicroUsd: 6090 }, audit: { settledMicroUsd: 6090, reservedMicroUsd: 0 } });
    if (result.kind === "generated") expect(result.png.equals(transparent)).toBe(true);
    expect(f.fetchOnce).toHaveBeenCalledTimes(1);
    const call = (f.fetchOnce.mock.calls as unknown as [string, RequestInit][])[0]!;
    expect(call[0]).toBe("https://api.openai.com/v1/images/edits");
    expect(call[1].redirect).toBe("error");
    const form = call[1].body as FormData;
    expect(Object.fromEntries([...form.entries()].filter(([k]) => k !== "image[]"))).toEqual({
      model: "gpt-image-2", quality: "low", size: "1024x1024", background: "transparent", output_format: "png", n: "1", prompt: f.input.prompt,
    });
    expect(form.getAll("image[]")).toHaveLength(2);
    expect(form.has("input_fidelity")).toBe(false);
    expect(JSON.stringify(f.store.rows.get(f.input.worldId))).not.toContain("not-a-live-credential");
  });
  it("does not redispatch settled requests; source reuse needs its durable artifact", async () => {
    const f = await fixture(); await f.provider.generate(f.input);
    expect(await f.provider.generate(f.input)).toMatchObject({ kind: "already-recorded", requestState: "settled" });
    expect(f.fetchOnce).toHaveBeenCalledTimes(1);
  });
  it("labels requested-only model provenance honestly when the image endpoint omits model", async () => {
    const f = await fixture(async () => reply({ model: undefined }));
    expect(await f.provider.generate(f.input)).toMatchObject({ kind: "generated", modelProvenance: "requested-endpoint-model-not-returned" });
  });
  it("does not accept a response reporting HIGH even though LOW was requested", async () => {
    const f = await fixture(async () => reply({ quality: "high" }));
    await expect(f.provider.generate(f.input)).rejects.toMatchObject({ code: "invalid_output" });
    expect((await f.budget.audit(f.input.worldId)).settledMicroUsd).toBe(6090);
    expect(f.fetchOnce).toHaveBeenCalledTimes(1);
  });
  it("allows only one dispatch for racing identical requests", async () => {
    const f = await fixture();
    const results = await Promise.all([f.provider.generate(f.input), f.provider.generate(f.input)]);
    expect(results.map(r => r.kind).sort()).toEqual(["already-recorded", "generated"]);
    expect(f.fetchOnce).toHaveBeenCalledTimes(1);
  });
  it.each(["prompt", "identityPng", "stylePng"] as const)("rejects changed %s before reservation or dispatch", async field => {
    const f = await fixture();
    const altered = { ...f.input, [field]: field === "prompt" ? "changed" : opaque };
    await expect(f.provider.generate(altered)).rejects.toMatchObject({ code: "invalid_input" });
    expect(f.fetchOnce).not.toHaveBeenCalled(); expect(f.store.rows.size).toBe(0);
  });
  it("rejects a changed rate card or budget with the old frozen fingerprint", async () => {
    const f = await fixture();
    const changed = new BudgetedOpenAiFixedSourceProvider("fake", f.budget, { ...policy, reserveMicroUsd: 260_000 }, f.fetchOnce as typeof fetch);
    await expect(changed.generate(f.input)).rejects.toMatchObject({ code: "invalid_input" });
    expect(f.fetchOnce).not.toHaveBeenCalled();
  });
  it("rejects a PNG with a readable header but truncated raster before reservation", async () => {
    const f = await fixture();
    const truncated = reference.subarray(0, Math.floor(reference.length * 0.65));
    expect((await sharp(truncated).metadata()).width).toBe(32);
    await expect(f.provider.generate({ ...f.input, stylePng: truncated })).rejects.toMatchObject({ code: "invalid_input" });
    expect(f.fetchOnce).not.toHaveBeenCalled(); expect(f.store.rows.size).toBe(0);
  });
  it.each([
    ["503 not JSON", () => Promise.resolve(new Response("Unavailable", { status: 503 }))],
    ["transport failure", () => Promise.reject(new Error("must-not-log-raw-secret"))],
    ["missing usage", () => Promise.resolve(reply({ usage: undefined }))],
    ["bad totals", () => Promise.resolve(reply({ usage: { input_tokens: 30, output_tokens: 196, input_tokens_details: { text_tokens: 30, image_tokens: 20 } } }))],
    ["missing request ID", () => Promise.resolve(reply({}, 200, {} as { "x-request-id": string }))],
    ["unexpected model", () => Promise.resolve(reply({ model: "unapproved-model" }))],
  ] as const)("%s retains the entire unknown reservation and never retries", async (_name, invoke) => {
    const f = await fixture(invoke);
    await expect(f.provider.generate(f.input)).rejects.toMatchObject({ code: "cost_unknown" });
    expect(await f.budget.audit(f.input.worldId)).toMatchObject({ held: true, committedMicroUsd: 250_000, settledMicroUsd: 0, unknownRequestKeys: [f.input.requestKey] });
    expect(await f.provider.generate(f.input)).toMatchObject({ kind: "already-recorded", requestState: "unknown" });
    await expect(f.provider.generate({ ...f.input, requestKey: "cannot-hide-a-retry" })).rejects.toMatchObject({ code: "world_held" });
    expect(f.fetchOnce).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.store.rows.get(f.input.worldId))).not.toContain("must-not-log-raw-secret");
  });
  it.each(["opaque", "empty", "bad-base64", "wrong-size", "http-error"])("records the known bill for %s output and does not retry", async kind => {
    const f = await fixture(async () => reply({ data: kind === "empty" ? [] : [{ b64_json: kind === "opaque" ? opaque.toString("base64")
      : kind === "wrong-size" ? reference.toString("base64") : kind === "bad-base64" ? "!!!" : transparent.toString("base64") }] }, kind === "http-error" ? 500 : 200));
    await expect(f.provider.generate(f.input)).rejects.toMatchObject({ code: "invalid_output" });
    expect(await f.budget.audit(f.input.worldId)).toMatchObject({ held: false, settledMicroUsd: 6090, reservedMicroUsd: 0 });
    expect(f.fetchOnce).toHaveBeenCalledTimes(1);
  });
  it("records an overrun without clamping and blocks source consumption", async () => {
    const f = await fixture(async () => reply(), { ...policy, reserveMicroUsd: 5000 });
    await expect(f.provider.generate(f.input)).rejects.toMatchObject({ code: "world_held" });
    expect(await f.budget.audit(f.input.worldId)).toMatchObject({ held: true, settledMicroUsd: 6090, overrunRequestKeys: [f.input.requestKey] });
  });
  it("does not send when the remaining full-world budget is insufficient", async () => {
    const f = await fixture();
    await f.budget.reserve(f.input.worldId, { requestKey: "other", scope: "judge", operationFingerprint: "other", reserveMicroUsd: 4_900_000 });
    await expect(f.provider.generate(f.input)).rejects.toMatchObject({ code: "cap_exceeded" });
    expect(f.fetchOnce).not.toHaveBeenCalled();
  });
  it("does not send without an acknowledged durable reservation", async () => {
    const f = await fixture(); f.store.failWrites = true;
    await expect(f.provider.generate(f.input)).rejects.toMatchObject({ code: "ledger_unavailable", message: "Durable reservation was not confirmed; no image request was sent" });
    expect(f.fetchOnce).not.toHaveBeenCalled();
  });
  it("does not return the image when settlement and unknown-record writes fail", async () => {
    const f = await fixture();
    f.fetchOnce.mockImplementation(async () => { f.store.failWrites = true; return reply(); });
    await expect(f.provider.generate(f.input)).rejects.toMatchObject({ code: "ledger_unavailable" });
    expect(f.store.rows.get(f.input.worldId)?.snapshot.requests[0]?.state).toBe("pending");
    expect(f.fetchOnce).toHaveBeenCalledTimes(1);
  });
});

describe("what this route may buy is refused before the request is built", () => {
  // TypeScript does not see a quality or size that arrives from JSON, a script
  // argument or a plain JavaScript caller. Both of these reached a dispatchable
  // capture before this guard existed, and the file's own contract says HIGH and
  // AUTO stay out - so the refusal has to be a runtime one, ahead of payment.
  const withPolicy = (extra: Record<string, unknown>) =>
    prepareFixedSource({ sourceGroupKey: "guard", prompt: "A complete illustrated child.", stylePng: reference, identityPng: reference },
      { ...policy, ...extra } as FixedSourcePolicy);

  it.each([
    ["high", "Only LOW and MEDIUM may be bought on this route"],
    ["auto", "Only LOW and MEDIUM may be bought on this route"],
  ])("refuses quality %s", async (quality, message) => {
    await expect(withPolicy({ quality })).rejects.toThrow(message);
  });

  it.each(["9999x9999", "512x512", "1024x1025"])("refuses size %s", async size => {
    await expect(withPolicy({ size })).rejects.toThrow("Sheet size is not one this route may buy");
  });

  it("still allows exactly what the plan buys", async () => {
    const medium = await withPolicy({ quality: "medium", size: "1280x2160" });
    expect(medium.capture.settings.version).toBe("fixed-source-medium-1280x2160/v1");
    const single = await withPolicy({});
    expect(single.capture.settings.size).toBe("1024x1024");
    // Omitted policy fields keep the original capture shape, so nothing frozen moves.
    expect(single.capture.inputOrder).toEqual(["style", "identity"]);
    expect("referenceSha256" in single.capture).toBe(false);
  });

  it("carries extra reference atlases into the capture and the dispatched form", async () => {
    const prepared = await prepareFixedSource(
      { sourceGroupKey: "guard", prompt: "A complete illustrated child.", stylePng: reference, identityPng: reference,
        referencePngs: [reference, reference] },
      { ...policy, quality: "medium", size: "1280x2160" });
    expect(prepared.capture.inputOrder).toEqual(["style", "identity", "reference-1", "reference-2"]);
    expect(prepared.capture.referenceSha256).toHaveLength(2);
    expect(prepared.referencePngs).toHaveLength(2);
  });
});
