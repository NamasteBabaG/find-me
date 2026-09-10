import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { prepareBoardConditionedSource, type BoardConditioningInput } from "../board-conditioned-source";
import { prepareBoardPoseObservation } from "../../../infra/generation/board-pose-observer";
import type { BoardGenerationDependencies, BoardMeasurement } from "../board-conditioned-generation";
import type { FixedSourceResult } from "../../../infra/generation/openai-fixed-source";
import { WorldBudget, auditWorldBudget, type WorldBudgetSnapshot, type WorldChargeEvidence } from "../world-budget";
import { sha256Bytes } from "../fixed-sprite";
import { repositionBoardConditionedAppearances, type BoardRepositionRequest } from "../board-conditioned-reposition";

const bound = (png: Buffer) => ({ png, sha256: sha256Bytes(png) });
function clone<T>(v: T): T {
  if (Buffer.isBuffer(v)) return Buffer.from(v) as T;
  if (Array.isArray(v)) return v.map(clone) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, v]) => [k, clone(v)])) as T;
  return v;
}
let request: BoardRepositionRequest, deps: BoardGenerationDependencies;
let paidSnapshot: WorldBudgetSnapshot;
const forbidden = vi.fn(async (): Promise<never> => { throw new Error("unexpected side effect"); });
beforeAll(async () => {
  const board = await sharp({ create: { width: 120, height: 120, channels: 4, background: "#384970" } }).png().toBuffer();
  const fg = await sharp({ create: { width: 120, height: 120, channels: 4, background: "transparent" } }).composite([
    { input: await sharp({ create: { width: 120, height: 45, channels: 4, background: "#384970" } }).png().toBuffer(), left: 0, top: 75 },
  ]).png().toBuffer();
  const input: BoardConditioningInput = { boardId: "fixture", board: bound(board),
    child: { profileId: "fixture-child", ageYears: 8, illustratedIdentity: bound(board), referenceRole: "illustrated-identity" },
    slots: (["front-peek", "side-lean", "wave-peek"] as const).map((pose, i) => ({
      slot: { id: `slot-${i}`, pose, eye: { x: 20 + i * 40, y: 50 }, faceHeightPx: 8, window: { left: i * 40, top: 0, width: 40, height: 120 } },
      foreground: bound(fg), context: { left: i * 40, top: 0, width: 40, height: 120 }, originalPeople: { left: i * 40, top: 0, width: 20, height: 30 },
      poseDescription: `Natural ${pose}`, wardrobe: "Muted red cardigan", lighting: { key: "Cool sky above", fill: "Pavement bounce", shadows: "Soft painted shade", exposure: "Match nearby people" },
    })) };
  const sourcePolicy = { reserveMicroUsd: 200_000, providerNamespace: "synthetic:reuse", timeoutMs: 1000,
    rateCard: { id: "fixture", textInput: 5, imageInput: 8, imageOutput: 30 } };
  const observerPolicy = { reserveMicroUsd: 300_000, providerNamespace: "synthetic:reuse", timeoutMs: 1000 };
  const prepared = await prepareBoardConditionedSource(input, sourcePolicy);
  const rgba = Buffer.alloc(1024 * 1024 * 4);
  for (const centre of [170, 512, 853]) for (let y = 140; y < 700; y++) for (let x = centre - 60; x < centre + 60; x++) rgba.set([150, 80, 60, 253], (y * 1024 + x) * 4);
  const sheet = await sharp(rgba, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
  const observed = await prepareBoardPoseObservation({ sheetPng: sheet, slots: input.slots.map(s => ({ slotId: s.slot.id, pose: s.slot.pose })) }, observerPolicy);
  const evidence = (id: string, model: string): WorldChargeEvidence => ({ providerNamespace: "synthetic:reuse", providerRequestId: id,
    usageId: id, model, rawUsage: { tokens: 1 }, amountMicroUsd: 100, costBasis: "conservative-upper-estimate" });
  const sourceEvidence = evidence("fixture-source", "gpt-image-2"), observationEvidence = evidence("fixture-measure", "gpt-5.6-sol");
  const snapshot: WorldBudgetSnapshot = { worldId: "fixture:paid", requests: [
    { requestKey: "board:fixture:source:1", operationFingerprint: prepared.prepared.fingerprint, scope: "sheet", evidence: sourceEvidence },
    { requestKey: "board:fixture:measure:1", operationFingerprint: observed.fingerprint, scope: "judge", evidence: observationEvidence },
  ].map(r => ({ ...r, scope: r.scope as "sheet" | "judge", origin: "reserved", reserveMicroUsd: 200_000, unknownReasons: [], conflicts: [], state: "settled" })) };
  const source: Extract<FixedSourceResult, { kind: "generated" }> = { kind: "generated", png: sheet, pngSha256: sha256Bytes(sheet),
    fingerprint: prepared.prepared.fingerprint, capture: prepared.prepared.capture, evidence: sourceEvidence,
    modelProvenance: "response-confirmed", audit: auditWorldBudget(snapshot), semanticApproval: "pending" };
  const measurement: BoardMeasurement = { sheetSha256: source.pngSha256, fingerprint: observed.fingerprint, status: "ok", evidence: observationEvidence,
    sources: input.slots.map((s, i) => { const x = [170, 512, 853][i]!; return { slotId: s.slot.id, pose: s.slot.pose,
      eye: { x, y: 200 }, chin: { x, y: 250 }, protectedFacePolygon: [{ x: x - 30, y: 175 }, { x: x + 30, y: 175 }, { x: x + 30, y: 249 }, { x: x - 30, y: 249 }] }; }) };
  paidSnapshot = snapshot;
  deps = { sourcePolicy, observerPolicy, budget: new WorldBudget({ transactWorld: async (worldId, work) => {
    expect(worldId).toBe(snapshot.worldId); return work({ snapshot, createRequest: forbidden, updateRequest: forbidden });
  } }), sources: { generate: forbidden }, measure: forbidden,
    checkpoints: { getSource: async () => source, getMeasurement: async () => measurement, putSource: forbidden, putMeasurement: forbidden } };
  request = { sourceWorldId: snapshot.worldId, sourceExpectedContractSha256: prepared.contractSha256,
    sourceInput: input, destinationInput: clone(input), destinationRevisionId: "geometry-v2" };
}, 30_000);

describe("free board-conditioned geometry revision", () => {
  it("preserves legacy provenance when attempt 1 is explicit or omitted", async () => {
    const a = await repositionBoardConditionedAppearances(deps, clone(request));
    const b = await repositionBoardConditionedAppearances(deps, { ...clone(request), sourceMeasurementAttempt: 1 });
    expect(a.provenanceSha256).toBe(b.provenanceSha256);
    expect(a.provenance.source).not.toHaveProperty("measurementAttempt");
  });
  it("rejects unsupported observation attempts before any checkpoint access", async () => {
    await expect(repositionBoardConditionedAppearances(deps,
      { ...clone(request), sourceMeasurementAttempt: 3 as 2 })).rejects.toThrow(/attempt must be 1 or 2/);
  });
  it("explicitly replays retained observation 2 and includes both paid observations without dispatch", async () => {
    const first = clone((await deps.checkpoints.getMeasurement(request.sourceWorldId, "fixture"))!);
    const source = (await deps.checkpoints.getSource(request.sourceWorldId, "fixture"))!;
    const capture = (await prepareBoardPoseObservation({ sheetPng: source.png, slots: request.sourceInput.slots.map(s => ({ slotId: s.slot.id, pose: s.slot.pose })) }, deps.observerPolicy)).capture;
    const answerFor = (m: BoardMeasurement) => JSON.stringify({ figureCount: 3, extraProps: false, reason: "Three complete synthetic figures", cells: m.sources!.map(s => ({
      slotId: s.slotId, pose: s.pose, poseMatches: true, visibleHeadArmsComplete: true,
      eye: { status: "observed", point: s.eye, confidence: .96, reason: "Synthetic opaque eye" },
      chin: { status: "observed", point: s.chin, confidence: .96, reason: "Synthetic opaque chin" },
      protectedFacePolygon: { status: "observed", polygon: s.protectedFacePolygon, confidence: .96, reason: "Synthetic complete face" },
    })) });
    first.receipt = { version: "board-pose-observation-receipt/v1", fingerprint: first.fingerprint,
      sourceImageSha256: first.sheetSha256, sourceRgbaSha256: capture.sourceRgbaSha256, wireImageSha256: capture.wireImageSha256,
      promptSha256: capture.promptSha256, slots: capture.slots,
      coordinates: "native-1024-sheet-pixel-edges", modelRequested: "gpt-5.6-sol", modelReturned: "gpt-5.6-sol", effort: "high",
      requestId: "fixture-measure", responseId: "chatcmpl-fixture-1", httpStatus: 200, serviceTier: null, finishReason: "stop",
      responseText: answerFor(first), rawUsage: { tokens: 1 }, costUnknown: false, costCents: .01, attempts: 1 };
    const second = clone(first);
    second.evidence = { ...first.evidence, providerRequestId: "fixture-measure-2", usageId: "fixture-measure-2" };
    second.sources![0]!.eye.x += 2;
    second.receipt = { ...second.receipt!, requestId: "fixture-measure-2", responseId: "chatcmpl-fixture-2", responseText: answerFor(second) };
    const snapshot = { ...clone(paidSnapshot), requests: [...clone(paidSnapshot.requests),
      { ...clone(paidSnapshot.requests[1]!), requestKey: "board:fixture:measure:2", evidence: second.evidence }] };
    const getMeasurement = vi.fn(async (_w: string, _b: string, attempt?: 1 | 2) => attempt === 2 ? second : first);
    const selectedDeps = { ...deps, checkpoints: { ...deps.checkpoints, getMeasurement },
      budget: new WorldBudget({ transactWorld: async (_w, work) => work({ snapshot, createRequest: forbidden, updateRequest: forbidden }) }) };
    const result = await repositionBoardConditionedAppearances(selectedDeps, { ...clone(request), sourceMeasurementAttempt: 2 });
    expect(getMeasurement).toHaveBeenCalledWith(request.sourceWorldId, "fixture", 2);
    expect(result.originalResult.measurement.evidence.providerRequestId).toBe("fixture-measure-2");
    expect(result.provenance.source).toMatchObject({ measurementAttempt: 2, originalMeasurementCharge: first.evidence, measurementCharge: second.evidence });
    expect(result.provenance.priorSourceAndMeasurementCostMicroUsd).toBe(300);
    expect(result.provenance.newApiCalls).toBe(0);
    expect(forbidden).not.toHaveBeenCalled();
  });
  it("keeps paid provenance while recomposing actual extracted pixels at a new destination", async () => {
    const r = clone(request); r.destinationInput.slots[0]!.slot.eye.x += 2;
    const result = await repositionBoardConditionedAppearances(deps, r);
    expect(result.appearances.every(a => a.state === "visual-review-required")).toBe(true);
    expect(result.provenance.source.contractSha256).toBe(r.sourceExpectedContractSha256);
    expect(result.provenance.destination.contractSha256).not.toBe(r.sourceExpectedContractSha256);
    expect(result.provenance).toMatchObject({ originalPaidContractRetained: true, sourcePixelsChanged: false,
      newApiCalls: 0, incrementalCostMicroUsd: 0, generatedForDestination: false, semanticStatus: "pending", automaticRelease: false });
    expect(result.appearances[0]!.sprite.png).toEqual(result.originalResult.extracted.sprites[0]!.png);
    expect(result.appearances[0]!.composite!.transform.translateX - result.originalResult.appearances[0]!.composite!.transform.translateX).toBe(2);
    expect(forbidden).not.toHaveBeenCalled();
  });
  it.each(["light", "wardrobe", "gesture", "pose", "child", "art", "style", "map"])("refuses incompatible %s rather than buying or pretending it was repainted", async change => {
    const r = clone(request);
    if (change === "light") r.destinationInput.slots[0]!.lighting.key = "Direct midday sunlight";
    if (change === "wardrobe") r.destinationInput.slots[0]!.wardrobe = "Short beach shirt";
    if (change === "gesture") r.destinationInput.slots[0]!.poseDescription = "Turn around and face backwards";
    if (change === "pose") r.destinationInput.slots[0]!.slot.pose = "seated";
    if (change === "child") r.destinationInput.child.ageYears = 6;
    if (change === "art") r.destinationInput.boardId = "other-board";
    if (change === "style") r.destinationInput.sourcePresentation = "local-composite/v5";
    if (change === "map") r.mapping = [{ sourceSlotId: "slot-0", destinationSlotId: "slot-1" }];
    await expect(repositionBoardConditionedAppearances(deps, r)).rejects.toThrow(/BOARD_REPOSITION/);
    expect(forbidden).not.toHaveBeenCalled();
  });
  it("refuses a missing paid checkpoint without calling a supplied live provider", async () => {
    const missing = { ...deps, checkpoints: { ...deps.checkpoints, getSource: async () => null } };
    await expect(repositionBoardConditionedAppearances(missing, clone(request))).rejects.toThrow(/cached source\/measurement required/);
    expect(forbidden).not.toHaveBeenCalled();
  });
  it("keeps actual destination geometry failures visible, never approved", async () => {
    const r = clone(request);
    r.destinationInput.slots[0]!.slot.forbiddenRects = [{ id: "original-bystander", left: 10, top: 35, width: 20, height: 25 }];
    const result = await repositionBoardConditionedAppearances(deps, r);
    expect(result.appearances[0]!.state).toBe("placement-review-required");
    expect(result.appearances[0]!.composite!.checks.forbiddenRegionsClear).toBe(false);
    expect(result.previewIsDiagnostic).toBe(true);
    expect(result.automaticRelease).toBe(false);
  });
  it("replays a separately recorded bounded tone grade without changing source, placement, alpha or guards", async () => {
    const rawRequest = clone(request), baseline = await repositionBoardConditionedAppearances(deps, rawRequest);
    const gradedRequest = clone(request);
    gradedRequest.destinationInput.slots[0]!.slot.compositingTone = { version: "local-exposure-chroma/v1", exposureStops: -.25, saturation: .8 };
    const result = await repositionBoardConditionedAppearances(deps, gradedRequest);
    const oldComposite = baseline.appearances[0]!.composite!, graded = result.appearances[0]!.composite!;
    expect(graded.transform).toEqual(oldComposite.transform); expect(graded.checks).toEqual(oldComposite.checks);
    expect(result.appearances[0]!.sprite).toEqual(baseline.appearances[0]!.sprite);
    expect(graded.source.sha256).not.toBe(result.appearances[0]!.sprite.sha256);
    expect("compositingTone" in graded && graded.compositingTone).toMatchObject({ originalSourceSha256: result.appearances[0]!.sprite.sha256,
      derivedSourceSha256: graded.source.sha256, alphaPreservedExactly: true, originalSourcePreserved: true, semanticStatus: "pending" });
    const a = await sharp(oldComposite.patchPng).ensureAlpha().raw().toBuffer(), b = await sharp(graded.patchPng).ensureAlpha().raw().toBuffer();
    for (let i = 3; i < a.length; i += 4) expect(a[i]).toBe(b[i]);
    expect(result.provenance).toMatchObject({ sourcePixelsChanged: true, newApiCalls: 0, incrementalCostMicroUsd: 0 });
    expect(result.provenance.source.contractSha256).toBe(request.sourceExpectedContractSha256);
    expect(result.provenance.destination.contractSha256).not.toBe(baseline.provenance.destination.contractSha256);
    expect(forbidden).not.toHaveBeenCalled();
  });
});
