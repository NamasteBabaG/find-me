import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { prepareBoardConditionedSource, type BoardConditioningInput } from "../board-conditioned-source";
import { generateBoardConditionedAppearances, generateBoardConditionedWorld, type BoardConditionedCheckpointStore, type BoardGenerationDependencies, type BoardMeasurement } from "../board-conditioned-generation";
import { BudgetedOpenAiFixedSourceProvider, type FixedSourceResult } from "../../../infra/generation/openai-fixed-source";
import { BudgetedBoardPoseObserver, prepareBoardPoseObservation } from "../../../infra/generation/board-pose-observer";
import { WorldBudget, type WorldBudgetSnapshot } from "../world-budget";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore, type VersionedWorldBudgetSnapshot } from "../../../infra/db/world-budget-repository";

class TestBudgetStore implements AtomicWorldBudgetStore {
  rows = new Map<string, VersionedWorldBudgetSnapshot>();
  async read(id: string) { return structuredClone(this.rows.get(id) ?? null); }
  async insertIfAbsent(id: string, snapshot: WorldBudgetSnapshot) { if (this.rows.has(id)) return false; this.rows.set(id, { revision: 0, snapshot: structuredClone(snapshot) }); return true; }
  async compareAndSwap(id: string, revision: number, snapshot: WorldBudgetSnapshot) { if (this.rows.get(id)?.revision !== revision) return false; this.rows.set(id, { revision: revision + 1, snapshot: structuredClone(snapshot) }); return true; }
}
class TestCheckpoints implements BoardConditionedCheckpointStore {
  sources = new Map<string, Extract<FixedSourceResult, { kind: "generated" }>>();
  measurements = new Map<string, BoardMeasurement>();
  failSourceSave = false;
  async getSource(world: string, board: string) { return this.sources.get(`${world}/${board}`) ?? null; }
  async putSource(world: string, board: string, source: Extract<FixedSourceResult, { kind: "generated" }>) { if (this.failSourceSave) throw new Error("save failed"); this.sources.set(`${world}/${board}`, source); }
  async getMeasurement(world: string, board: string, attempt: 1 | 2 = 1) { return this.measurements.get(`${world}/${board}${attempt === 2 ? "/measure-2" : ""}`) ?? null; }
  async putMeasurement(world: string, board: string, result: BoardMeasurement, attempt: 1 | 2 = 1) { this.measurements.set(`${world}/${board}${attempt === 2 ? "/measure-2" : ""}`, result); }
}
const sourcePolicy = { reserveMicroUsd: 200_000, providerNamespace: "openai:test", timeoutMs: 1000, rateCard: { id: "fixture", textInput: 5, imageInput: 8, imageOutput: 30 } };
const observerPolicy = { reserveMicroUsd: 300_000, providerNamespace: "openai:test", timeoutMs: 1000 };
const hash = (png: Buffer) => createHash("sha256").update(png).digest("hex");
const bound = (png: Buffer) => ({ png, sha256: hash(png) });
async function fixture(drawExtra?: (rgba: Buffer) => void) {
  const board = await sharp({ create: { width: 120, height: 120, channels: 4, background: "#384970" } }).png().toBuffer();
  const fg = await sharp({ create: { width: 120, height: 120, channels: 4, background: "#00000000" } }).composite([{ input: await sharp({ create: { width: 120, height: 45, channels: 4, background: "#384970" } }).png().toBuffer(), left: 0, top: 75 }]).png().toBuffer();
  const input: BoardConditioningInput = { boardId: "tokyo", board: bound(board), child: { profileId: "child", ageYears: 8, illustratedIdentity: bound(board), referenceRole: "illustrated-identity" },
    slots: (["front-peek", "side-lean", "wave-peek"] as const).map((pose, i) => ({ slot: { id: `slot-${i}`, pose, eye: { x: 20 + i * 40, y: 50 }, faceHeightPx: 8, window: { left: i * 40, top: 0, width: 40, height: 120 } }, foreground: bound(fg),
      context: { left: i * 40, top: 0, width: 40, height: 120 }, originalPeople: { left: i * 40, top: 0, width: 20, height: 30 }, poseDescription: `Natural ${pose} upper body`, wardrobe: "Pink cardigan over cotton shirt",
      lighting: { key: i === 1 ? "Cool street light above" : "Amber shop light above right", fill: "Blue violet ambient", shadows: "Broad painted shadows", exposure: "Like nearby painted people" } })) };
  const rgba = Buffer.alloc(1024 * 1024 * 4);
  for (const centre of [170, 512, 853]) for (let y = 140; y < 700; y++) for (let x = centre - 60; x < centre + 60; x++) {
    const index = (y * 1024 + x) * 4; rgba[index] = 150; rgba[index + 1] = 80; rgba[index + 2] = 60; rgba[index + 3] = 253;
  }
  drawExtra?.(rgba);
  const sheet = await sharp(rgba, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
  const observation = { figureCount: 3, extraProps: false, cells: input.slots.map((s, i) => {
    const x = [170, 512, 853][i]!, reading = (x: number, y: number) => ({ status: "observed", point: { x, y }, confidence: .96, reason: "Observed visible landmark" });
    return { slotId: s.slot.id, pose: s.slot.pose, poseMatches: true, visibleHeadArmsComplete: true, eye: reading(x, 200), chin: reading(x, 250), protectedFacePolygon: { status: "observed", confidence: .96, reason: "Visible entire face", polygon: [{ x: x - 30, y: 175 }, { x: x + 30, y: 175 }, { x: x + 30, y: 249 }, { x: x - 30, y: 249 }] } };
  }), reason: "Three complete visible upper-body poses" };
  const imageReply = () => new Response(JSON.stringify({ model: "gpt-image-2", usage: { input_tokens: 30, output_tokens: 196, input_tokens_details: { text_tokens: 10, image_tokens: 20 } }, data: [{ b64_json: sheet.toString("base64") }] }), { headers: { "x-request-id": "req-image" } });
  const measureReply = (requestId = "req-observer") => new Response(JSON.stringify({ id: "chatcmpl-fixture", model: "gpt-5.6-sol", usage: { prompt_tokens: 2000, completion_tokens: 400, total_tokens: 2400 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(observation) } }] }), { headers: { "x-request-id": requestId } });
  const fetchImage = vi.fn(async () => imageReply()), fetchMeasure = vi.fn(async () => measureReply());
  const budget = new WorldBudget(new CasWorldBudgetRepository(new TestBudgetStore()), { authorizeUnknownContinuation: async () => true }), checkpoints = new TestCheckpoints();
  const observer = new BudgetedBoardPoseObserver("test-only", budget, observerPolicy, fetchMeasure as typeof fetch);
  const deps: BoardGenerationDependencies = { sourcePolicy, observerPolicy, budget, checkpoints, sources: new BudgetedOpenAiFixedSourceProvider("test-only", budget, sourcePolicy, fetchImage as typeof fetch),
    measure: async args => {
      const p = await prepareBoardPoseObservation(args, observerPolicy), result = await observer.observe({ ...args, expectedFingerprint: p.fingerprint });
      if (result.kind === "already-recorded") return null;
      return { sheetSha256: result.receipt.sourceImageSha256, fingerprint: result.receipt.fingerprint, status: result.status, sources: result.sources, evidence: result.evidence,
        receipt: result.receipt, completenessDeferred: result.completenessDeferred };
    } };
  const prepared = await prepareBoardConditionedSource(input, sourcePolicy);
  const request = { worldId: "game:world", input, expectedContractSha256: prepared.contractSha256 };
  return { input, deps, checkpoints, budget, fetchImage, fetchMeasure, request, sheet, observation, measureReply };
}

describe("board-conditioned game engine, real adapters with synthetic no-cost HTTP", () => {
  it("yields a paid source before observation and resumes it without buying another image", async () => {
    const f = await fixture();
    const request = { ...f.request, yieldAfterNewSource: true };
    expect(await generateBoardConditionedAppearances(f.deps, request)).toMatchObject({ state: "source-ready" });
    expect(f.fetchImage).toHaveBeenCalledTimes(1); expect(f.fetchMeasure).not.toHaveBeenCalled();
    expect(await generateBoardConditionedAppearances(f.deps, request)).toMatchObject({ state: "review-required" });
    expect(f.fetchImage).toHaveBeenCalledTimes(1); expect(f.fetchMeasure).toHaveBeenCalledTimes(1);
  });
  it("recovers one missing response only with exact approval, retaining the unknown reserve and source", async () => {
    const f = await fixture(), firstKey = `board:${f.input.boardId}:measure:1`;
    f.fetchMeasure.mockRejectedValueOnce(new Error("transport failed"));
    await expect(generateBoardConditionedAppearances(f.deps, f.request)).rejects.toThrow();
    const unknown = await f.budget.readRequest(f.request.worldId, firstKey);
    if (unknown?.state !== "unknown") throw new Error("expected unknown charge");
    const retained = JSON.stringify(unknown);
    await expect(generateBoardConditionedAppearances(f.deps, { ...f.request, measurementAttempt: 2, transportRecoveryApprovalId: "approval-test" })).rejects.toThrow("world budget is held");
    await f.budget.authorizeUnknownContinuation(f.request.worldId, { requestKey: firstKey, scope: unknown.scope,
      operationFingerprint: unknown.operationFingerprint, reserveMicroUsd: unknown.reserveMicroUsd, unknownReasons: unknown.unknownReasons,
      approvalId: "approval-test", operatorId: "admin-test", authorizationSha256: "a".repeat(64), authorizedAt: "2026-09-10T00:00:00.000Z" });
    await expect(generateBoardConditionedAppearances(f.deps, { ...f.request, measurementAttempt: 2 })).rejects.toThrow("original immutable same-sheet receipt");
    await expect(generateBoardConditionedAppearances(f.deps, { ...f.request, measurementAttempt: 2, transportRecoveryApprovalId: "different" })).rejects.toThrow("exact durable operator approval");
    const recovered = await generateBoardConditionedAppearances(f.deps, { ...f.request, measurementAttempt: 2, transportRecoveryApprovalId: "approval-test" });
    expect(recovered).toMatchObject({ state: "review-required", measurementAttempt: 2 });
    expect(await generateBoardConditionedAppearances(f.deps, { ...f.request, measurementAttempt: 2, transportRecoveryApprovalId: "approval-test" })).toEqual(recovered);
    expect(JSON.stringify(await f.budget.readRequest(f.request.worldId, firstKey))).toBe(retained);
    expect(await f.budget.audit(f.request.worldId)).toMatchObject({ unknownRequestKeys: [firstKey], reservedMicroUsd: 300_000, held: false });
    expect(f.fetchImage).toHaveBeenCalledTimes(1); expect(f.fetchMeasure).toHaveBeenCalledTimes(2);
    expect(await f.checkpoints.getMeasurement(f.request.worldId, f.input.boardId, 1)).toBeNull();
  });
  it("re-observes the exact paid sheet once without overwriting the first receipt or buying another image", async () => {
    const f = await fixture();
    const first = await generateBoardConditionedAppearances(f.deps, f.request);
    const original = JSON.stringify(await f.checkpoints.getMeasurement(f.request.worldId, f.input.boardId));
    const source = await f.checkpoints.getSource(f.request.worldId, f.input.boardId);
    f.observation.cells[0]!.eye.point.x += 1;
    f.fetchMeasure.mockImplementationOnce(async () => f.measureReply("req-observer-second"));
    const second = await generateBoardConditionedAppearances(f.deps, { ...f.request, measurementAttempt: 2 });
    expect(second).toMatchObject({ state: "review-required", measurementAttempt: 2 });
    expect(JSON.stringify(await f.checkpoints.getMeasurement(f.request.worldId, f.input.boardId))).toBe(original);
    expect(await f.checkpoints.getSource(f.request.worldId, f.input.boardId)).toBe(source);
    expect(f.fetchImage).toHaveBeenCalledTimes(1); expect(f.fetchMeasure).toHaveBeenCalledTimes(2);
    expect((await f.budget.readRequest(f.request.worldId, `board:${f.input.boardId}:measure:2`))?.state).toBe("settled");
    expect(await generateBoardConditionedAppearances(f.deps, { ...f.request, measurementAttempt: 2 })).toEqual(second);
    const originalReplay = await generateBoardConditionedAppearances(f.deps, f.request);
    expect(originalReplay).not.toHaveProperty("measurementAttempt");
    if (first.state === "review-required" && originalReplay.state === "review-required") expect(originalReplay.measurement).toEqual(first.measurement);
    expect(f.fetchImage).toHaveBeenCalledTimes(1); expect(f.fetchMeasure).toHaveBeenCalledTimes(2);
  });
  it("cannot invoke a second observation without original source and receipt or request a third", async () => {
    const f = await fixture();
    await expect(generateBoardConditionedAppearances(f.deps, { ...f.request, measurementAttempt: 2 })).rejects.toThrow("retained original paid source");
    expect(f.fetchImage).not.toHaveBeenCalled(); expect(f.fetchMeasure).not.toHaveBeenCalled();
    await generateBoardConditionedAppearances(f.deps, f.request);
    const original = await f.checkpoints.getMeasurement(f.request.worldId, f.input.boardId);
    delete original!.receipt;
    await expect(generateBoardConditionedAppearances(f.deps, { ...f.request, measurementAttempt: 2 })).rejects.toThrow("original immutable same-sheet receipt");
    await expect(generateBoardConditionedAppearances(f.deps, { ...f.request, measurementAttempt: 3 as 2 })).rejects.toThrow("at most two");
    expect(f.fetchImage).toHaveBeenCalledTimes(1); expect(f.fetchMeasure).toHaveBeenCalledTimes(1);
  });
  it("holds an unknown second observer outcome without a source rerender or automatic third measurement", async () => {
    const f = await fixture(); await generateBoardConditionedAppearances(f.deps, f.request);
    f.fetchMeasure.mockImplementationOnce(async () => new Response("unavailable", { status: 503 }));
    await expect(generateBoardConditionedAppearances(f.deps, { ...f.request, measurementAttempt: 2 })).rejects.toThrow();
    expect((await f.budget.audit(f.request.worldId)).held).toBe(true);
    await expect(generateBoardConditionedAppearances(f.deps, { ...f.request, measurementAttempt: 2 })).rejects.toThrow("world budget is held");
    expect(f.fetchImage).toHaveBeenCalledTimes(1); expect(f.fetchMeasure).toHaveBeenCalledTimes(2);
  });
  it("runs actual LOW source + automatic three-pose measurement + fixed compositions in exactly two calls", async () => {
    const f = await fixture(), result = await generateBoardConditionedAppearances(f.deps, f.request);
    expect(result.state).toBe("review-required");
    if (result.state !== "review-required") throw new Error("wrong state");
    expect(result.appearances).toHaveLength(3);
    for (const item of result.appearances) {
      expect(item.state).toBe("visual-review-required");
      expect(item.sprite.measurement.kind).toBe("observed");
      if (!("composite" in item)) throw new Error("missing composition");
      expect(item.composite?.ok).toBe(true); expect(item.composite?.automaticRelease).toBe(false);
      expect(Object.values(item.composite!.checks).every(Boolean)).toBe(true);
    }
    expect(result.reviewDimensions).toContain("local-lighting"); expect(result.reviewDimensions).toContain("style");
    expect(f.fetchImage).toHaveBeenCalledTimes(1); expect(f.fetchMeasure).toHaveBeenCalledTimes(1);
    expect(await f.budget.audit(f.request.worldId)).toMatchObject({ settledMicroUsd: 24090, reservedMicroUsd: 0, held: false });
  });
  it("resumes saved source/measurements for free without generating another sheet or moving anchors", async () => {
    const f = await fixture(), first = await generateBoardConditionedAppearances(f.deps, f.request), replay = await generateBoardConditionedAppearances(f.deps, f.request);
    expect(replay.state).toBe("review-required"); expect(f.fetchImage).toHaveBeenCalledTimes(1); expect(f.fetchMeasure).toHaveBeenCalledTimes(1);
    if (first.state === "review-required" && replay.state === "review-required") expect(replay.appearances.map(a => "composite" in a ? a.composite?.transform : null)).toEqual(first.appearances.map(a => "composite" in a ? a.composite?.transform : null));
  });
  it("holds a settled-but-unsaved source instead of redispatching after a crash", async () => {
    const f = await fixture(); f.checkpoints.failSourceSave = true;
    await expect(generateBoardConditionedAppearances(f.deps, f.request)).rejects.toThrow("save failed");
    f.checkpoints.failSourceSave = false;
    expect(await generateBoardConditionedAppearances(f.deps, f.request)).toMatchObject({ state: "reconciliation-required", stage: "source" });
    expect(f.fetchImage).toHaveBeenCalledTimes(1); expect(f.fetchMeasure).not.toHaveBeenCalled();
  });
  it("refuses changed lighting under old intent and preflights every board before any spend", async () => {
    const f = await fixture(); f.input.slots[0]!.lighting.key = "New unknown studio lighting";
    await expect(generateBoardConditionedAppearances(f.deps, f.request)).rejects.toThrow("intent changed");
    await expect(generateBoardConditionedWorld(f.deps, { worldId: f.request.worldId, boards: [{ input: f.input, expectedContractSha256: f.request.expectedContractSha256 }] })).rejects.toThrow("stale board intent");
    expect(f.fetchImage).not.toHaveBeenCalled();
  });
  it("does not replace uncertain pose observations with manual seeds or retry a whole sheet", async () => {
    const f = await fixture(); f.observation.cells[1]!.poseMatches = false;
    const result = await generateBoardConditionedAppearances(f.deps, f.request);
    expect(result.state).toBe("source-review-required"); expect(f.fetchImage).toHaveBeenCalledTimes(1); expect(f.fetchMeasure).toHaveBeenCalledTimes(1);
    expect((await generateBoardConditionedAppearances(f.deps, f.request)).state).toBe("source-review-required");
    expect(f.fetchMeasure).toHaveBeenCalledTimes(1);
  });
  // Before 9 September 2026 a single cell's source-only completeness doubt voided
  // the whole sheet before anything knew what the foreground hides. The doubt is
  // now carried to the destination, which still refuses a cut it leaves showing.
  it("composes a cell whose completeness the source reviewer could not settle, and records why it passed", async () => {
    const f = await fixture(); f.observation.cells[1]!.visibleHeadArmsComplete = false;
    const result = await generateBoardConditionedAppearances(f.deps, f.request);
    expect(result.state).toBe("review-required");
    if (result.state !== "review-required") throw new Error("wrong state");
    const deferredSlot = f.observation.cells[1]!.slotId;
    const item: any = result.appearances.find(a => a.slotId === deferredSlot);
    expect(item.state).toBe("visual-review-required");
    expect(item.composite.checks.lowerCutFullyOccluded).toBe(true);
    expect(item.composite.checks.onlyLowerEdgeTruncated).toBe(true);
    expect(item.completenessDeferred).toMatchObject({ slotId: deferredSlot, visibleHeadArmsComplete: false });
    for (const other of result.appearances.filter(a => a.slotId !== deferredSlot)) expect((other as any).completenessDeferred).toBeNull();
    expect(f.fetchImage).toHaveBeenCalledTimes(1); expect(f.fetchMeasure).toHaveBeenCalledTimes(1);
  });
  it("still refuses a deferred cell whose cut the foreground leaves visible", async () => {
    const f = await fixture(); f.observation.cells[1]!.visibleHeadArmsComplete = false;
    // The negative control: the same deferred cell with nothing drawn in front of
    // it. Deferring the question must not become a way of never asking it.
    const clear = await sharp({ create: { width: 120, height: 120, channels: 4, background: "#00000000" } }).png().toBuffer();
    const input = { ...f.input, slots: f.input.slots.map((slot, i) => i !== 1 ? slot : { ...slot, foreground: bound(clear) }) };
    const prepared = await prepareBoardConditionedSource(input, sourcePolicy);
    const result = await generateBoardConditionedAppearances(f.deps, { worldId: "game:control", input, expectedContractSha256: prepared.contractSha256 });
    if (result.state !== "review-required") throw new Error("wrong state");
    const item: any = result.appearances.find(a => a.slotId === f.observation.cells[1]!.slotId);
    expect(item.state).toBe("placement-review-required");
    expect(item.completenessDeferred).toMatchObject({ visibleHeadArmsComplete: false });
  });
  /**
   * The ten composition checks are alpha, occlusion and containment tests. They
   * are NOT a check on visible anatomy, and deferring source completeness must
   * not be described as if they were. Here an extra limb-shaped lobe is drawn
   * ATTACHED to the middle figure, well above the occluded cut and touching no
   * frame edge: every geometric check still passes. What protects the game is
   * that nothing here approves anything - the appearance stops at
   * visual-review-required with automaticRelease false, awaiting a person.
   */
  it("passes geometry for an attached visible defect, and still refuses to call it approved", async () => {
    const f = await fixture(rgba => {
      for (let y = 300; y < 340; y++) for (let x = 566; x < 578; x++) rgba.set([150, 80, 60, 253], (y * 1024 + x) * 4);
    });
    const result = await generateBoardConditionedAppearances(f.deps, f.request);
    if (result.state !== "review-required") throw new Error("wrong state");
    const item: any = result.appearances[1];
    expect(Object.entries(item.composite.checks).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    expect(item.composite.ok).toBe(true);
    // The gate that matters for a drawn defect is a human, not these checks.
    expect(item.state).toBe("visual-review-required");
    expect(result.automaticRelease).toBe(false);
    expect(item.composite.semanticStatus).toBe("pending");
    expect(result.reviewDimensions).toContain("anatomy");
  });
  it("rejects corrupt checkpoints and unrelated measurement fingerprints without another charge", async () => {
    const f = await fixture(); await generateBoardConditionedAppearances(f.deps, f.request);
    const measurement = [...f.checkpoints.measurements.values()][0]!; measurement.fingerprint = "0".repeat(64);
    await expect(generateBoardConditionedAppearances(f.deps, f.request)).rejects.toThrow("different source sheet or pose request");
    expect(f.fetchImage).toHaveBeenCalledTimes(1); expect(f.fetchMeasure).toHaveBeenCalledTimes(1);
  });
});
