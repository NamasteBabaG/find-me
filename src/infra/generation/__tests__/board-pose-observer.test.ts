import { beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { BudgetedBoardPoseObserver, prepareBoardPoseObservation, boardPoseObserverPrompt, decideBoardPoseObservation, type BoardPoseObserverPolicy, type BoardPoseSlot } from "../board-pose-observer";
import { WorldBudget, type WorldBudgetSnapshot } from "../../../services/generation/world-budget";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore, type VersionedWorldBudgetSnapshot } from "../../db/world-budget-repository";
import { boardObserverFailure } from "../board-observer-diagnostics";

/** Test-only durable-contract backing, never used by production. */
class Store implements AtomicWorldBudgetStore {
  rows = new Map<string, VersionedWorldBudgetSnapshot>(); failWrites = false;
  async read(id: string) { return structuredClone(this.rows.get(id) ?? null); }
  async insertIfAbsent(id: string, snapshot: WorldBudgetSnapshot) {
    if (this.failWrites) throw new Error("private DB connection"); if (this.rows.has(id)) return false;
    this.rows.set(id, { revision: 0, snapshot: structuredClone(snapshot) }); return true;
  }
  async compareAndSwap(id: string, revision: number, snapshot: WorldBudgetSnapshot) {
    if (this.failWrites) throw new Error("private DB connection"); if (this.rows.get(id)?.revision !== revision) return false;
    this.rows.set(id, { revision: revision + 1, snapshot: structuredClone(snapshot) }); return true;
  }
}
const slots: BoardPoseSlot[] = [{ slotId: "tokyo-left", pose: "front-peek" }, { slotId: "tokyo-middle", pose: "side-lean" }, { slotId: "tokyo-right", pose: "wave-peek" }];
const policy: BoardPoseObserverPolicy = { reserveMicroUsd: 300_000, providerNamespace: "openai:test", timeoutMs: 1000 };
let png: Buffer, hole: Buffer, small: Buffer;
beforeAll(async () => {
  const rgba = Buffer.alloc(1024 * 1024 * 4);
  // Three separate opaque upper-body silhouettes. No legs or feet: deliberate.
  for (const centre of [170, 512, 853]) for (let y = 140; y < 700; y++) for (let x = centre - 90; x < centre + 90; x++) {
    const p = (y * 1024 + x) * 4; rgba[p] = 130; rgba[p + 1] = 90; rgba[p + 2] = 50; rgba[p + 3] = 253;
  }
  png = await sharp(rgba, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
  rgba[(210 * 1024 + 170) * 4 + 3] = 0;
  hole = await sharp(rgba, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
  small = await sharp({ create: { width: 20, height: 20, channels: 4, background: "red" } }).png().toBuffer();
});
const point = (x: number, y: number) => ({ status: "observed", point: { x, y }, confidence: .95, reason: "Visible pupil midpoint or chin" });
function answer() {
  return { figureCount: 3, extraProps: false, cells: slots.map((s, i) => {
    const x = [170, 512, 853][i]!;
    return { ...s, poseMatches: true, visibleHeadArmsComplete: true, eye: point(x, 200), chin: point(x, 250),
      protectedFacePolygon: { status: "observed", polygon: [{ x: x - 30, y: 175 }, { x: x + 30, y: 175 }, { x: x + 30, y: 249 }, { x: x - 30, y: 249 }], confidence: .95, reason: "Visible face including eyes nose and mouth" } };
  }), reason: "Three complete visible upper-body poses with intentional lower truncation" };
}
function response(content: unknown = answer(), extra: Record<string, unknown> = {}, status = 200, requestId = "req_observe") {
  return new Response(JSON.stringify({ id: "chatcmpl-observe", model: "gpt-5.6-sol", service_tier: "default", usage: { prompt_tokens: 2000, completion_tokens: 400, total_tokens: 2400 },
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }], ...extra }), { status, headers: requestId ? { "x-request-id": requestId } : {} });
}
async function fixture(reply: () => Promise<Response> = async () => response(), sheetPng = png, selectedPolicy = policy) {
  const store = new Store(), budget = new WorldBudget(new CasWorldBudgetRepository(store)), fetchOnce = vi.fn(reply);
  const provider = new BudgetedBoardPoseObserver("fake-only", budget, selectedPolicy, fetchOnce as typeof fetch);
  const source = { sheetPng, slots }, prepared = await prepareBoardPoseObservation(source, selectedPolicy);
  const input = { ...source, worldId: "game:world", requestKey: "tokyo-source-observation-1", expectedFingerprint: prepared.fingerprint };
  return { store, budget, fetchOnce, provider, input, prepared };
}
describe("budgeted board three-pose source observer (no live API)", () => {
  it("never treats an upper-body measurement as complete standing anatomy", async () => {
    const expected = slots.map(s => ({ ...s, pose: "standing" }));
    const reply = answer(); reply.cells.forEach(c => { c.pose = "standing"; });
    const rgba = await sharp(png).ensureAlpha().raw().toBuffer();
    expect(decideBoardPoseObservation(reply, expected, rgba).status).toBe("uncertain");
    expect(boardPoseObserverPrompt(expected)).toContain("never infer feet from the crop boundary");
    const withFeet = { ...reply, cells: reply.cells.map((c, i) => ({ ...c, standing: { complete: true,
      crown: point([170, 512, 853][i]!, 140), leftSole: point([170, 512, 853][i]! - 10, 699), rightSole: point([170, 512, 853][i]! + 10, 699) } })) };
    expect(decideBoardPoseObservation(withFeet, expected, rgba).status).toBe("ok");
    const offContour = structuredClone(withFeet);
    offContour.cells[0]!.standing.leftSole.point.y = 705;
    expect(decideBoardPoseObservation(offContour, expected, rgba).status).toBe("invalid");
    const deferred = decideBoardPoseObservation(offContour, expected, rgba, { standingPixelSupportAtComposition: true });
    expect(deferred.status).toBe("ok");
    // Preserve the failing point for the compositor's completeFigure rejection.
    expect(deferred.sources![0]!.standing!.leftSole.y).toBe(705);
    withFeet.cells[0]!.standing.leftSole.confidence = .2;
    expect(decideBoardPoseObservation(withFeet, expected, rgba).status).toBe("uncertain");
    expect(decideBoardPoseObservation(withFeet, expected, rgba, { standingPixelSupportAtComposition: true }).status).toBe("uncertain");
  });
  it("reserves once, uses only one full source on gray with Sol HIGH, and returns native-pixel face seeds without feet", async () => {
    const f = await fixture();
    f.fetchOnce.mockImplementation(async () => { expect((await f.budget.audit(f.input.worldId)).pendingRequestKeys).toEqual([f.input.requestKey]); return response(); });
    const out = await f.provider.observe(f.input);
    expect(out).toMatchObject({ kind: "observed", status: "ok", approved: true, evidence: { amountMicroUsd: 18000, model: "gpt-5.6-sol" }, audit: { settledMicroUsd: 18000, reservedMicroUsd: 0 },
      receipt: { fingerprint: f.prepared.fingerprint, sourceImageSha256: f.prepared.capture.sourceImageSha256, requestId: "req_observe", costUnknown: false, attempts: 1 } });
    if (out.kind === "observed") {
      expect(out.sources?.map(s => s.eye)).toEqual([{ x: 170, y: 200 }, { x: 512, y: 200 }, { x: 853, y: 200 }]);
      expect(out.sources?.[0]).not.toHaveProperty("leftFoot"); expect(out.reason).toContain("not identity/style/placement");
    }
    const [url, init] = (f.fetchOnce.mock.calls as unknown as [string, RequestInit][])[0]!, body = JSON.parse(String(init.body));
    expect(url).toBe("https://api.openai.com/v1/chat/completions"); expect(init.redirect).toBe("error");
    expect(body).toMatchObject({ model: "gpt-5.6-sol", reasoning_effort: "high", max_completion_tokens: 8000, service_tier: "default", store: false });
    expect(body.messages[0].content).toHaveLength(2); expect(body.messages[0].content[0].text).toBe(f.prepared.promptSent);
    expect(body.messages[0].content[1].image_url.url).toBe(`data:image/png;base64,${f.prepared.wirePng.toString("base64")}`);
    expect(f.fetchOnce).toHaveBeenCalledTimes(1); expect(JSON.stringify(f.store.rows.get(f.input.worldId))).not.toContain("fake-only");
  });
  it("does not redispatch settled requests, including racing calls", async () => {
    const f = await fixture(), outputs = await Promise.all([f.provider.observe(f.input), f.provider.observe(f.input)]);
    expect(outputs.map(o => o.kind).sort()).toEqual(["already-recorded", "observed"]); expect(f.fetchOnce).toHaveBeenCalledTimes(1);
    expect(await f.provider.observe(f.input)).toMatchObject({ kind: "already-recorded", requestState: "settled" }); expect(f.fetchOnce).toHaveBeenCalledTimes(1);
  });
  it("rejects changed source, pose map or policy before reservation", async () => {
    const f = await fixture();
    for (const change of [{ sheetPng: hole }, { slots: [...slots].reverse() }, { slots: slots.map((s, i) => i ? s : { ...s, pose: "seated" }) }]) {
      await expect(f.provider.observe({ ...f.input, ...change })).rejects.toMatchObject({ code: "invalid_input" });
    }
    const altered = new BudgetedBoardPoseObserver("fake", f.budget, { ...policy, reserveMicroUsd: 310_000 }, f.fetchOnce as typeof fetch);
    await expect(altered.observe(f.input)).rejects.toMatchObject({ code: "invalid_input" }); expect(f.fetchOnce).not.toHaveBeenCalled(); expect(f.store.rows.size).toBe(0);
  });
  it("rejects missing/duplicate slot IDs and invalid frame before dispatch", async () => {
    const f = await fixture();
    await expect(f.provider.observe({ ...f.input, slots: [slots[0]!, slots[0]!, slots[2]!] })).rejects.toThrow();
    await expect(f.provider.observe({ ...f.input, slots: slots.slice(0, 2) })).rejects.toThrow();
    await expect(f.provider.observe({ ...f.input, sheetPng: small })).rejects.toMatchObject({ code: "invalid_input" }); expect(f.fetchOnce).not.toHaveBeenCalled();
  });
  it.each(["wrong-id", "wrong-pose", "wrong-order", "extra-figure", "prop", "wrong-gesture", "invented-sole", "normalized-points", "tiny-cheek", "crossed-polygon", "unsupported-eye"])("settles known bill but holds %s without seeds or retry", async kind => {
    const a: any = answer(), c = a.cells[0];
    if (kind === "wrong-id") c.slotId = "different-slot";
    if (kind === "wrong-pose") c.pose = "seated";
    if (kind === "wrong-order") a.cells.reverse();
    if (kind === "extra-figure") a.figureCount = 4;
    if (kind === "prop") a.extraProps = true;
    if (kind === "wrong-gesture") c.poseMatches = false;
    if (kind === "invented-sole") c.leftFoot = point(170, 700);
    if (kind === "normalized-points") { c.eye.point = { x: .17, y: .2 }; c.chin.point = { x: .17, y: .25 }; }
    if (kind === "tiny-cheek") c.protectedFacePolygon.polygon = [{ x: 169, y: 220 }, { x: 171, y: 220 }, { x: 171, y: 222 }, { x: 169, y: 222 }];
    if (kind === "crossed-polygon") [c.protectedFacePolygon.polygon[1], c.protectedFacePolygon.polygon[2]] = [c.protectedFacePolygon.polygon[2], c.protectedFacePolygon.polygon[1]];
    if (kind === "unsupported-eye") c.eye.point.x = 40;
    const f = await fixture(async () => response(a));
    expect(await f.provider.observe(f.input)).toMatchObject({ kind: "observed", status: "invalid", approved: false, sources: null, receipt: { costUnknown: false } });
    expect(await f.budget.audit(f.input.worldId)).toMatchObject({ settledMicroUsd: 18000, reservedMicroUsd: 0 }); expect(f.fetchOnce).toHaveBeenCalledTimes(1);
  });
  // The observer never sees the board, so "this arm ends at the drawn edge" is
  // not yet a defect: at the frozen destination that edge may be entirely behind
  // the authored foreground. The cell is carried forward and composition decides
  // (9 September 2026, tokyo v6 cell B voided the whole sheet for a lowered hand
  // the planter fully hides). Composition's refusal is exercised separately.
  it.each([false, null])("defers visible completeness %s to the destination instead of voiding the sheet", async flag => {
    const a: any = answer(); a.cells[1].visibleHeadArmsComplete = flag;
    const f = await fixture(async () => response(a));
    const observed: any = await f.provider.observe(f.input);
    expect(observed).toMatchObject({ kind: "observed", status: "ok", approved: true });
    expect(observed.sources).toHaveLength(3);
    expect(observed.completenessDeferred).toEqual([{ slotId: a.cells[1].slotId, visibleHeadArmsComplete: flag, reason: a.reason }]);
    expect(observed.reason).toContain(a.cells[1].slotId);
    expect(await f.budget.audit(f.input.worldId)).toMatchObject({ settledMicroUsd: 18000, reservedMicroUsd: 0 });
  });
  it("reports no deferral and keeps the plain reason when every cell is complete", async () => {
    const f = await fixture(async () => response());
    const observed: any = await f.provider.observe(f.input);
    expect(observed).toMatchObject({ status: "ok", completenessDeferred: [] });
    expect(observed.reason).not.toContain("deferred");
  });
  it("still voids the sheet for a wrong gesture even when completeness is deferred", async () => {
    const a: any = answer(); a.cells[1].visibleHeadArmsComplete = false; a.cells[0].poseMatches = false;
    const f = await fixture(async () => response(a));
    expect(await f.provider.observe(f.input)).toMatchObject({ status: "invalid", approved: false, sources: null });
  });
  it("does not approve a real transparent hole in a protected face", async () => {
    const f = await fixture(async () => response(), hole);
    expect(await f.provider.observe(f.input)).toMatchObject({ status: "invalid", approved: false, sources: null, reason: "Protected face has missing or transparent source pixels" });
  });
  it.each(["point", "polygon", "pose", "count", "confidence"])("returns uncertain for %s without inventing measurements", async kind => {
    const a: any = answer();
    if (kind === "point") a.cells[0].eye = { status: "uncertain", point: null, confidence: .95, reason: "Pupil hidden" };
    if (kind === "polygon") a.cells[0].protectedFacePolygon = { status: "uncertain", polygon: null, confidence: .95, reason: "Face hidden" };
    if (kind === "pose") a.cells[1].poseMatches = null;
    if (kind === "count") a.figureCount = null;
    if (kind === "confidence") a.cells[2].chin.confidence = .84;
    const f = await fixture(async () => response(a)); expect(await f.provider.observe(f.input)).toMatchObject({ status: "uncertain", approved: false, sources: null });
  });
  it.each(["fetch-failure", "unreadable", "missing-usage", "invalid-totals", "wrong-model", "wrong-tier", "missing-request-id"])("retains full unknown reserve after %s and prevents subsequent spending", async kind => {
    const f = await fixture(async () => {
      if (kind === "fetch-failure") throw new Error("must-not-leak-private-provider-text");
      if (kind === "unreadable") return new Response("not-json", { status: 503 });
      return response(answer(), kind === "missing-usage" ? { usage: undefined } : kind === "invalid-totals" ? { usage: { prompt_tokens: 2000, completion_tokens: 400, total_tokens: 1 } }
        : kind === "wrong-model" ? { model: "another-model" } : kind === "wrong-tier" ? { service_tier: "priority" } : {}, 200, kind === "missing-request-id" ? "" : "req_observe");
    });
    await expect(f.provider.observe(f.input)).rejects.toMatchObject({ code: "cost_unknown" });
    expect(await f.budget.audit(f.input.worldId)).toMatchObject({ held: true, committedMicroUsd: 300_000, settledMicroUsd: 0, unknownRequestKeys: [f.input.requestKey] });
    expect(await f.provider.observe(f.input)).toMatchObject({ kind: "already-recorded", requestState: "unknown" });
    await expect(f.provider.observe({ ...f.input, requestKey: "new-key" })).rejects.toMatchObject({ code: "world_held" }); expect(f.fetchOnce).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.store.rows.get(f.input.worldId))).not.toContain("must-not-leak");
  });
  it.each([
    ["network", "request", "network-or-runtime", null],
    ["body", "response-body", "body-read", 502],
    ["json", "response-json", "invalid-json", 503],
    ["envelope", "response-envelope", "invalid-envelope", 200],
  ] as const)("attaches bounded %s diagnostics without changing charges or permitting another dispatch", async (kind, stage, failure, httpStatus) => {
    const f = await fixture(async () => {
      if (kind === "network") throw new Error("Bearer secret-provider-detail");
      if (kind === "body") return { status: 502, headers: new Headers({ "x-request-id": "req_diagnostic" }), text: async () => { throw new Error("sk-secret-body-content"); } } as unknown as Response;
      return new Response(kind === "json" ? "private HTML gateway content" : "[]", { status: httpStatus!, headers: { "x-request-id": "req_diagnostic" } });
    });
    const error = await f.provider.observe(f.input).catch(error => error);
    expect(error).toMatchObject({ code: "cost_unknown", diagnostic: { version: "board-observer-failure/v1", worldId: f.input.worldId,
      requestKey: f.input.requestKey, fingerprint: f.prepared.fingerprint, sourceImageSha256: f.prepared.capture.sourceImageSha256,
      stage, failure, billing: "unknown", httpStatus, requestId: kind === "network" ? null : "req_diagnostic" } });
    expect(error.diagnostic.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(error.diagnostic.elapsedMs).toBeLessThan(10_000);
    expect(JSON.stringify(error.diagnostic)).not.toMatch(/secret|private HTML|Authorization|responseText|headers|promptSent/);
    expect(await f.budget.audit(f.input.worldId)).toMatchObject({ held: true, committedMicroUsd: 300_000, settledMicroUsd: 0 });
    expect(await f.provider.observe(f.input)).toMatchObject({ kind: "already-recorded", requestState: "unknown" });
    expect(f.fetchOnce).toHaveBeenCalledTimes(1);
  });
  it("does not copy injected provider strings into the persisted diagnostic projection", async () => {
    const f = await fixture(async () => response(answer(), { model: "Bearer private-key", usage: { prompt_tokens: "sk-private-token", completion_tokens: 400 } }, 200, "sk-private-request"));
    const error = await f.provider.observe(f.input).catch(error => error);
    const safe = boardObserverFailure({ worldId: f.input.worldId, requestKey: f.input.requestKey, receipt: error.receipt,
      stage: "charge-evidence", failure: "invalid-charge", elapsedMs: 1 });
    expect(safe).toMatchObject({ requestId: null, requestIdStatus: "invalid", returnedModel: "unexpected", usage: { promptTokens: null, completionTokens: 400, totalTokens: null } });
    expect(JSON.stringify(safe)).not.toMatch(/private-key|private-token|private-request|responseText/);
  });
  it.each(["bad-json", "http-error", "length", "refusal"])("settles known charge before %s output validation", async kind => {
    const f = await fixture(async () => response(answer(), kind === "bad-json" ? { choices: [{ finish_reason: "stop", message: { content: "invalid" } }] }
      : kind === "length" ? { choices: [{ finish_reason: "length", message: { content: "{}" } }] }
      : kind === "refusal" ? { choices: [{ finish_reason: "stop", message: { refusal: "No", content: "{}" } }] } : {}, kind === "http-error" ? 500 : 200));
    expect(await f.provider.observe(f.input)).toMatchObject({ status: "invalid", approved: false, receipt: { costUnknown: false } });
    expect(await f.budget.audit(f.input.worldId)).toMatchObject({ settledMicroUsd: 18000, reservedMicroUsd: 0 }); expect(f.fetchOnce).toHaveBeenCalledTimes(1);
  });
  it("does not send before durable reservation acknowledgement", async () => {
    const f = await fixture(); f.store.failWrites = true;
    await expect(f.provider.observe(f.input)).rejects.toMatchObject({ code: "ledger_unavailable" }); expect(f.fetchOnce).not.toHaveBeenCalled();
  });
  it("keeps pending reserve and withholds sources when settlement writes fail", async () => {
    const f = await fixture(); f.fetchOnce.mockImplementation(async () => { f.store.failWrites = true; return response(); });
    await expect(f.provider.observe(f.input)).rejects.toMatchObject({ code: "ledger_unavailable" });
    expect(f.store.rows.get(f.input.worldId)?.snapshot.requests[0]?.state).toBe("pending"); expect(f.fetchOnce).toHaveBeenCalledTimes(1);
  });
  it("records over-reserve real charge and withholds sources", async () => {
    const f = await fixture(async () => response(), png, { ...policy, reserveMicroUsd: 10_000 });
    await expect(f.provider.observe(f.input)).rejects.toMatchObject({ code: "world_held" });
    expect(await f.budget.audit(f.input.worldId)).toMatchObject({ held: true, settledMicroUsd: 18000, overrunRequestKeys: [f.input.requestKey] });
  });
  it.each(["fetch", "body"])("bounds hung %s once, retains unknown reserve", async kind => {
    const pending = new Promise<never>(() => {});
    const f = await fixture(async () => kind === "fetch" ? pending : { status: 200, headers: new Headers({ "x-request-id": "req_hung" }), text: () => pending } as unknown as Response, png, { ...policy, timeoutMs: 10 });
    await expect(f.provider.observe(f.input)).rejects.toMatchObject({ code: "cost_unknown", diagnostic: {
      stage: kind === "fetch" ? "request" : "response-body", failure: "timeout", billing: "unknown",
      requestId: kind === "fetch" ? null : "req_hung", httpStatus: kind === "fetch" ? null : 200 } });
    expect(await f.budget.audit(f.input.worldId)).toMatchObject({ held: true, reservedMicroUsd: 300_000 }); expect(f.fetchOnce).toHaveBeenCalledTimes(1);
  });
  it("prompt forbids destinations/hidden anatomy and distinguishes intentional lower truncation", () => {
    const prompt = boardPoseObserverPrompt(slots);
    expect(prompt).toContain("no board, destination, expected landmarks"); expect(prompt).toContain("FULL ORIGINAL 1024x1024");
    expect(prompt).toContain("Do NOT require visible feet"); expect(prompt).toContain("lower torso can intentionally end"); expect(prompt).toContain("tiny cheek-only");
    expect(prompt).not.toContain("Yuval");
  });
});
