import sharp from "sharp";
import type { FixedSourcePolicy } from "../../infra/generation/openai-fixed-source";
import { BOARD_POSE_OBSERVER_SETTINGS, decideBoardPoseObservation, prepareBoardPoseObservation, type BoardPoseObserverPolicy } from "../../infra/generation/board-pose-observer";
import { boardConditioningHash, prepareBoardConditionedSource, type BoardConditioningInput } from "./board-conditioned-source";
import type { generateBoardConditionedAppearances } from "./board-conditioned-generation";
import { extractBoardSprites } from "./board-sprite-extraction";
import { composeBoardPlacement } from "./board-placement";
import { sha256Bytes } from "./fixed-sprite";

type OriginalResult = Extract<Awaited<ReturnType<typeof generateBoardConditionedAppearances>>, { state: "source-review-required" }>;
export interface BoardUpperBodyRecoveryPlan {
  version: "upper-body-occluded-destination/v1";
  destinationRevisionId: string;
  sourceSlotId: string;
  /** A separately authored fixed pocket, never observer-selected or child-specific. */
  eye: { x: number; y: number };
  faceHeightPx: number;
  /** Optional separately authored geometry-only fixes for the other slots. */
  additionalGeometry?: { sourceSlotId: string; eye: { x: number; y: number }; faceHeightPx: number }[];
}
export interface BoardUpperBodyRecoveryRequest {
  worldId: string;
  originalInput: BoardConditioningInput;
  expectedOriginalContractSha256: string;
  sourcePolicy: FixedSourcePolicy;
  observerPolicy: BoardPoseObserverPolicy;
  originalResult: OriginalResult;
  plan: BoardUpperBodyRecoveryPlan;
}
const demand: (value: unknown, message: string) => asserts value = (value, message) => {
  if (!value) throw new Error(`BOARD_UPPER_BODY_RECOVERY: ${message}`);
};
const same = (a: unknown, b: unknown) => boardConditioningHash(a) === boardConditioningHash(b);

/**
 * A NEW explicitly authored occluded destination can use a complete upper body
 * from a failed full-standing request. The original standing verdict, source
 * capture, paid response and bill remain intact. No feet are inferred, no source
 * pixels are repaired, and this result is deliberately NOT a normal successful
 * BoardGenerationResult. It still needs independent player replay and visual QA.
 *
 * This pure recovery cannot dispatch, reserve, write a checkpoint or access a DB.
 * Callers obtain originalResult through the ordinary charge-verified generator.
 */
export async function recoverBoardOccludedUpperBody(request: BoardUpperBodyRecoveryRequest) {
  const { originalResult: original, plan } = request;
  demand(/^[A-Za-z0-9_:-]{1,240}$/.test(request.worldId), "invalid world scope");
  demand(plan?.version === "upper-body-occluded-destination/v1"
    && /^[A-Za-z0-9_-]{1,120}$/.test(plan.destinationRevisionId)
    && /^[A-Za-z0-9_-]{1,120}$/.test(plan.sourceSlotId), "explicit versioned destination plan required");
  demand(original.state === "source-review-required" && !("extractionFailure" in original), "only a retained source-observation rejection can use this derivation");
  const prepared = await prepareBoardConditionedSource(request.originalInput, request.sourcePolicy);
  demand(prepared.contractSha256 === request.expectedOriginalContractSha256
    && original.contractSha256 === prepared.contractSha256 && original.boardId === prepared.input.boardId,
  "original frozen contract changed");
  const input = prepared.input, source = original.source, m = original.measurement, receipt = m.receipt;
  demand(source.audit.worldId === request.worldId && source.pngSha256 === sha256Bytes(source.png)
    && source.fingerprint === prepared.prepared.fingerprint && same(source.capture, prepared.prepared.capture), "original source scope, bytes or capture changed");
  demand(source.evidence.providerNamespace === request.sourcePolicy.providerNamespace && source.evidence.model === "gpt-image-2"
    && source.semanticApproval === "pending", "known original image provenance required");
  const slots = input.slots.map(s => ({ slotId: s.slot.id, pose: s.slot.pose }));
  const observed = await prepareBoardPoseObservation({ sheetPng: source.png, slots }, request.observerPolicy);
  const evidenceUsage = m.evidence.rawUsage && typeof m.evidence.rawUsage === "object" && !Array.isArray(m.evidence.rawUsage)
    ? m.evidence.rawUsage as Record<string, unknown> : null;
  demand(receipt?.responseText && m.sheetSha256 === source.pngSha256 && m.fingerprint === observed.fingerprint
    && receipt.fingerprint === observed.fingerprint && receipt.sourceImageSha256 === source.pngSha256
    && receipt.sourceRgbaSha256 === observed.capture.sourceRgbaSha256 && receipt.wireImageSha256 === observed.capture.wireImageSha256
    && receipt.promptSha256 === observed.capture.promptSha256 && same(receipt.slots, slots)
    && receipt.version === "board-pose-observation-receipt/v1" && receipt.coordinates === "native-1024-sheet-pixel-edges"
    && receipt.requestId === m.evidence.providerRequestId && receipt.modelRequested === BOARD_POSE_OBSERVER_SETTINGS.model
    && receipt.modelReturned === m.evidence.model && m.evidence.model === BOARD_POSE_OBSERVER_SETTINGS.model
    && m.evidence.providerNamespace === request.observerPolicy.providerNamespace
    && ["prompt_tokens", "completion_tokens"].every(key => Number.isSafeInteger(receipt.rawUsage?.[key])
      && Number(receipt.rawUsage?.[key]) >= 0 && receipt.rawUsage?.[key] === evidenceUsage?.[key])
    && receipt.effort === BOARD_POSE_OBSERVER_SETTINGS.effort && receipt.attempts === 1 && receipt.costUnknown === false
    && Math.ceil(receipt.costCents * 10_000) === m.evidence.amountMicroUsd && receipt.finishReason === "stop" && !!receipt.responseId
    && receipt.httpStatus !== null && receipt.httpStatus >= 200 && receipt.httpStatus < 300,
  "complete original observer receipt and known charge binding required");
  demand(original.measurementAttempt === undefined || original.measurementAttempt === 2, "unknown observation selection");
  if (original.measurementAttempt === 2) {
    const charge = original.measurementCharge;
    demand(charge && (charge.state === "settled" || charge.state === "linked") && charge.scope === "judge"
      && [`board:${input.boardId}:measure:2`, `attempt-2:board:${input.boardId}:measure:2`].includes(charge.requestKey)
      && charge.operationFingerprint === m.fingerprint && charge.unknownReasons.length === 0 && charge.conflicts.length === 0
      && same(charge.evidence, m.evidence), "second observation needs its exact settled charge");
  } else demand(!original.measurementCharge, "selected second charge cannot masquerade as observation one");
  let raw: any;
  try { raw = JSON.parse(receipt.responseText); } catch { throw new Error("BOARD_UPPER_BODY_RECOVERY: original observer JSON is invalid"); }
  const originalDecision = decideBoardPoseObservation(raw, slots, observed.rgba, { standingPixelSupportAtComposition: true });
  demand(originalDecision.status === "uncertain"
    && originalDecision.reason === "Standing child needs directly observed complete body and both soles; completeness cannot be deferred",
  "original standing failure must be missing complete body, not uncertain gesture, identity, props or invalid face");
  demand(m.status === originalDecision.status && m.sources === null,
    "original rejected measurement cannot be relabeled as a successful source");
  const index = input.slots.findIndex(d => d.slot.id === plan.sourceSlotId), direction = input.slots[index];
  demand(direction && direction.slot.pose === "standing" && direction.slot.mode === "open", "recovery source must be an explicitly standing open slot");
  const cell = raw.cells?.[index];
  demand(raw.figureCount === 3 && raw.extraProps === false && cell?.slotId === plan.sourceSlotId
    && cell.pose === "standing" && cell.poseMatches === true && cell.visibleHeadArmsComplete === true
    && cell.standing?.complete === false && cell.standing.crown?.status === "observed"
    && cell.standing.crown.confidence >= BOARD_POSE_OBSERVER_SETTINGS.minConfidence
    && [cell.standing.leftSole, cell.standing.rightSole].every(p => p?.status === "uncertain" && p.point === null),
  "only a confidently complete requested upper body with explicitly absent soles is recoverable");
  // The new fixed pocket stays local and at the same scene depth. These are
  // limits on separate authoring, not adaptive relaxation of the old placement.
  const boundedPocket = (d: BoardConditioningInput["slots"][number], p: Pick<BoardUpperBodyRecoveryPlan, "eye" | "faceHeightPx">) => {
    demand(Number.isFinite(p.eye.x) && Number.isFinite(p.eye.y) && Number.isFinite(p.faceHeightPx)
      && Math.hypot(p.eye.x - d.slot.eye.x, p.eye.y - d.slot.eye.y) <= d.slot.faceHeightPx * .5
      && p.faceHeightPx >= d.slot.faceHeightPx * .8 && p.faceHeightPx <= d.slot.faceHeightPx,
    "new pocket must remain within half a local face and 80–100% of the authored local face scale");
  };
  boundedPocket(direction, plan);
  const additional = plan.additionalGeometry ?? [];
  demand(additional.length <= 2 && new Set(additional.map(p => p.sourceSlotId)).size === additional.length
    && additional.every(p => p.sourceSlotId !== plan.sourceSlotId && input.slots.some(d => d.slot.id === p.sourceSlotId)),
  "additional geometry must name distinct other original slots");
  for (const p of additional) boundedPocket(input.slots.find(d => d.slot.id === p.sourceSlotId)!, p);
  const { mode: _mode, pixelRefinement: _pixels, supportPointPx: _support, standingHeightPx: _height, ...base } = direction.slot;
  const derivedInput: BoardConditioningInput = { ...input, slots: input.slots.map((d, i) => {
    if (i === index) return { ...d, slot: { ...base, pose: "front-peek" as const, eye: { ...plan.eye }, faceHeightPx: plan.faceHeightPx,
      cutSelection: "two-hidden-rows-one-face-side-margin/v1" as const } };
    const change = additional.find(p => p.sourceSlotId === d.slot.id);
    return change ? { ...d, slot: { ...d.slot, eye: { ...change.eye }, faceHeightPx: change.faceHeightPx } } : d;
  }) };
  // An explicit derivation consumes only the original observed upper-body facts.
  // This clone is not saved as a paid response and never claims complete feet.
  const upperBodyAnswer = structuredClone(raw), upperBodySlots = structuredClone(slots);
  upperBodyAnswer.cells[index].pose = "front-peek";
  delete upperBodyAnswer.cells[index].standing;
  upperBodySlots[index]!.pose = "front-peek";
  const derivedDecision = decideBoardPoseObservation(upperBodyAnswer, upperBodySlots, observed.rgba, { standingPixelSupportAtComposition: true });
  demand(derivedDecision.status === "ok" && derivedDecision.sources?.length === 3, "derived upper-body face and other source checks failed");
  const derivedSources = derivedDecision.sources;
  const extracted = await extractBoardSprites({ sheetPng: source.png, expectedSheetSha256: source.pngSha256,
    seeds: derivedSources.map(s => ({ ...s, measurement: { kind: "observed" as const,
      note: `Upper-body destination derivation ${plan.destinationRevisionId}; original Sol receipt ${receipt.requestId}; original standing rejected` } })) });
  demand(extracted.sprites.every(s => !s.extraction.requiresBoundaryReview && !Object.values(s.extraction.originalFrameContact).some(Boolean)),
    "source frame defects cannot be hidden by upper-body recovery");
  const appearances = [];
  for (const d of derivedInput.slots) {
    const sprite = extracted.sprites.find(s => s.slotId === d.slot.id)!;
    const placement = await composeBoardPlacement(derivedInput.board, d, sprite, derivedSources.find(s => s.slotId === d.slot.id)!);
    appearances.push({ slotId: d.slot.id, sprite, composite: placement?.composite ?? null,
      cut: placement?.cut ?? null, robustness: placement && "robustness" in placement ? placement.robustness : null,
      state: placement?.composite.ok ? "visual-review-required" as const : "placement-review-required" as const });
  }
  const target = appearances[index]!;
  demand(target.composite?.ok && target.robustness && Object.values(target.composite.checks).every(Boolean),
    "new upper-body destination lacks exact protected-face, hidden-cut, margin or neighbor proof");
  const boardPreviewPng = await sharp(input.board.png).composite(appearances.flatMap(a => a.composite ? [{ input: a.composite.patchPng, left: 0, top: 0 }] : [])).png().toBuffer();
  const destination = await prepareBoardConditionedSource(derivedInput, request.sourcePolicy);
  const provenance = {
    version: "board-upper-body-recovery/v1" as const, worldId: request.worldId, boardId: input.boardId, plan: structuredClone(plan),
    original: { contractSha256: prepared.contractSha256, sourceFingerprint: source.fingerprint, sourceSha256: source.pngSha256,
      measurementFingerprint: m.fingerprint, measurementSha256: boardConditioningHash(m), receiptSha256: boardConditioningHash(receipt),
      sourceCharge: source.evidence, measurementCharge: m.evidence, decision: originalDecision,
      ...(original.measurementAttempt === 2 ? { measurementAttempt: 2 as const, selectedMeasurementCharge: original.measurementCharge } : {}) },
    destination: { contractSha256: destination.contractSha256, contract: destination.contract },
    derivation: { originalPose: "standing" as const, destinationPose: "front-peek" as const, sourceSlotId: plan.sourceSlotId,
      visibleHeadArmsComplete: true as const, originalStandingComplete: false as const, absentSolesRetainedInOriginalReceipt: true as const,
      faceBoundaryRefinements: derivedDecision.faceBoundaryRefinements ?? [], chinBoundaryRefinements: derivedDecision.chinBoundaryRefinements ?? [] },
    originalSourcePixelsChanged: false as const,
    sourcePixelsChanged: appearances.some(a => a.composite && a.composite.source.sha256 !== a.sprite.sha256),
    foregroundChanged: false as const, originalPaidContractRetained: true as const,
    generatedForDestination: false as const, newApiCalls: 0 as const, incrementalCostMicroUsd: 0 as const,
    appearances: appearances.map(a => ({ slotId: a.slotId, sourceSha256: a.sprite.sha256, state: a.state, lowerCutY: a.cut,
      robustness: a.robustness, patchSha256: a.composite ? sha256Bytes(a.composite.patchPng) : null })),
    boardPreviewSha256: sha256Bytes(boardPreviewPng), semanticStatus: "pending" as const, automaticRelease: false as const,
  };
  return { state: "upper-body-recovery-review-required" as const, boardId: input.boardId, originalResult: original,
    derivedInput: destination.input, derivedSources, derivedDecision, extracted, appearances, boardPreviewPng,
    provenance, provenanceSha256: boardConditioningHash(provenance),
    previewIsDiagnostic: appearances.some(a => a.state !== "visual-review-required"), automaticRelease: false as const };
}
export type BoardUpperBodyRecoveryResult = Awaited<ReturnType<typeof recoverBoardOccludedUpperBody>>;
