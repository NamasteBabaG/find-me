import sharp from "sharp";
import { boardConditioningHash, prepareBoardConditionedSource, type BoardConditioningInput } from "./board-conditioned-source";
import { generateBoardConditionedAppearances, type BoardGenerationDependencies } from "./board-conditioned-generation";
import { composeBoardPlacement } from "./board-placement";
import { sha256Bytes } from "./fixed-sprite";

export interface BoardRepositionMapping { sourceSlotId: string; destinationSlotId: string }
export interface BoardRepositionRequest {
  sourceWorldId: string;
  sourceExpectedContractSha256: string;
  /** Explicitly select a retained second observation of the same original sheet. */
  sourceMeasurementAttempt?: 1 | 2;
  sourceInput: BoardConditioningInput;
  destinationInput: BoardConditioningInput;
  /** New authored destination revision, never a replacement source/run ID. */
  destinationRevisionId: string;
  /** Omitted means exact slot IDs. Renaming needs an explicit one-to-one map. */
  mapping?: BoardRepositionMapping[];
}
function demand(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`BOARD_REPOSITION: ${message}`);
}
function same(a: unknown, b: unknown) { return boardConditioningHash(a) === boardConditioningHash(b); }

/**
 * Geometry-only reuse on the SAME artwork and for the SAME child. The original
 * paid source and observed landmarks are replayed against their original frozen
 * contract first. A separate destination record then owns location/scale/mask.
 *
 * This function cannot dispatch, reserve, or persist a paid checkpoint. Missing
 * cached assets fail closed. It does not relight, repaint, or relabel the source
 * as if it had been generated for the revised location. Text compatibility is
 * necessary but is NOT visual proof: every output remains review-required.
 */
export async function repositionBoardConditionedAppearances(deps: BoardGenerationDependencies, request: BoardRepositionRequest) {
  demand(/^[A-Za-z0-9_-]{1,120}$/.test(request.destinationRevisionId), "safe destination revision ID required");
  demand(request.sourceMeasurementAttempt === undefined || request.sourceMeasurementAttempt === 1 || request.sourceMeasurementAttempt === 2,
    "source measurement attempt must be 1 or 2");
  const sourceMeasurementSelection = request.sourceMeasurementAttempt === 2 ? { measurementAttempt: 2 as const } : {};
  const original = await prepareBoardConditionedSource(request.sourceInput, deps.sourcePolicy);
  const destination = await prepareBoardConditionedSource(request.destinationInput, deps.sourcePolicy);
  demand(original.contractSha256 === request.sourceExpectedContractSha256, "original frozen source intent changed");
  const sourceInput = original.input, targetInput = destination.input;
  demand(sourceInput.boardId === targetInput.boardId && sourceInput.board.sha256 === targetInput.board.sha256,
    "source reuse across a different board or artwork is forbidden");
  demand(same(original.contract.child, destination.contract.child), "source reuse for a different child/age/identity is forbidden");
  demand(sourceInput.sourcePresentation === targetInput.sourcePresentation, "source style-presentation revision changed; this is not geometry-only reuse");
  const mapping = request.mapping?.map(item => ({ ...item }))
    ?? targetInput.slots.map(item => ({ sourceSlotId: item.slot.id, destinationSlotId: item.slot.id }));
  demand(mapping.length === 3 && new Set(mapping.map(m => m.sourceSlotId)).size === 3
    && new Set(mapping.map(m => m.destinationSlotId)).size === 3
    && sourceInput.slots.every(s => mapping.some(m => m.sourceSlotId === s.slot.id))
    && targetInput.slots.every(s => mapping.some(m => m.destinationSlotId === s.slot.id)), "complete one-to-one source/destination slot map required");
  for (const m of mapping) {
    const a = sourceInput.slots.find(s => s.slot.id === m.sourceSlotId)!;
    const b = targetInput.slots.find(s => s.slot.id === m.destinationSlotId)!;
    demand(a.slot.pose === b.slot.pose && (a.slot.mode ?? "clipped") === (b.slot.mode ?? "clipped"), `${m.destinationSlotId}: pose or open/clipped mode changed`);
    demand(a.poseDescription === b.poseDescription, `${m.destinationSlotId}: intended gesture/activity changed`);
    demand(a.wardrobe === b.wardrobe, `${m.destinationSlotId}: wardrobe changed`);
    demand(same(a.lighting, b.lighting), `${m.destinationSlotId}: local lighting intent changed; needs separately evidenced relighting or a new source`);
  }

  // Protect the no-charge promise even if a caller accidentally supplies live
  // production dependencies. Only the already-recorded charge audit is read.
  const forbidden = async (): Promise<never> => { throw new Error("BOARD_REPOSITION: cached source/measurement required; dispatch and checkpoint writes are forbidden"); };
  const readOnly: BoardGenerationDependencies = { ...deps,
    sources: { generate: forbidden }, measure: forbidden,
    checkpoints: { getSource: (w, b) => deps.checkpoints.getSource(w, b), getMeasurement: (w, b, attempt) => deps.checkpoints.getMeasurement(w, b, attempt),
      putSource: forbidden, putMeasurement: forbidden } };
  const originalResult = await generateBoardConditionedAppearances(readOnly, {
    worldId: request.sourceWorldId, input: sourceInput, expectedContractSha256: original.contractSha256, ...sourceMeasurementSelection,
  });
  demand(originalResult.state === "review-required", `paid source is not reusable: ${originalResult.state}`);
  const originalMeasurementCharge = request.sourceMeasurementAttempt === 2
    ? (await deps.checkpoints.getMeasurement(request.sourceWorldId, sourceInput.boardId, 1))!.evidence : null;
  const appearances = [];
  for (const direction of targetInput.slots) {
    const m = mapping.find(m => m.destinationSlotId === direction.slot.id)!;
    const sprite = originalResult.extracted.sprites.find(s => s.slotId === m.sourceSlotId)!;
    const observed = originalResult.measurement.sources!.find(s => s.slotId === m.sourceSlotId)!;
    demand(sprite && observed, "verified original source cell missing");
    const placement = await composeBoardPlacement(targetInput.board, direction, sprite, observed);
    const completenessDeferred = originalResult.measurement.completenessDeferred?.find(d => d.slotId === m.sourceSlotId) ?? null;
    appearances.push({ slotId: direction.slot.id, sourceSlotId: m.sourceSlotId, sprite, completenessDeferred,
      state: placement?.composite.ok ? "visual-review-required" as const : "placement-review-required" as const,
      composite: placement?.composite ?? null,
      reason: placement ? null : direction.slot.mode === "open" ? "No complete observed standing source/contract" : "No already-occluded lower cut at revised geometry" });
  }
  const boardPreviewPng = await sharp(targetInput.board.png).composite(appearances.flatMap(a => a.composite
    ? [{ input: a.composite.patchPng, left: 0, top: 0 }] : [])).png().toBuffer();
  const provenance = {
    version: "board-conditioned-geometry-reuse/v1" as const,
    source: { worldId: request.sourceWorldId, contract: original.contract, contractSha256: original.contractSha256, ...sourceMeasurementSelection,
      fingerprint: originalResult.source.fingerprint, sheetSha256: originalResult.source.pngSha256,
      measurementFingerprint: originalResult.measurement.fingerprint,
      ...(originalMeasurementCharge ? { originalMeasurementCharge } : {}),
      sourceCharge: originalResult.source.evidence, measurementCharge: originalResult.measurement.evidence },
    destination: { revisionId: request.destinationRevisionId, contract: destination.contract,
      contractSha256: destination.contractSha256, mapping },
    sourcePixelsChanged: appearances.some(a => a.composite && a.composite.source.sha256 !== a.sprite.sha256), originalPaidContractRetained: true,
    generatedForDestination: false, newApiCalls: 0, incrementalCostMicroUsd: 0,
    priorSourceAndMeasurementCostMicroUsd: originalResult.source.evidence.amountMicroUsd + originalResult.measurement.evidence.amountMicroUsd
      + (originalMeasurementCharge?.amountMicroUsd ?? 0),
    boardPreviewSha256: sha256Bytes(boardPreviewPng),
    sourceRenderIntent: "original-source-contract" as const,
    semanticStatus: "pending" as const, automaticRelease: false as const,
    appearances: appearances.map(a => ({ slotId: a.slotId, sourceSlotId: a.sourceSlotId, sourceSha256: a.sprite.sha256,
      state: a.state, patchSha256: a.composite ? sha256Bytes(a.composite.patchPng) : null })),
  };
  return { version: provenance.version, state: "review-required" as const, boardId: targetInput.boardId,
    provenance, provenanceSha256: boardConditioningHash(provenance), originalResult,
    destinationInput: targetInput, appearances, boardPreviewPng,
    previewIsDiagnostic: appearances.some(a => a.state !== "visual-review-required"),
    semanticStatus: "pending" as const, automaticRelease: false as const };
}

export type BoardRepositionResult = Awaited<ReturnType<typeof repositionBoardConditionedAppearances>>;
