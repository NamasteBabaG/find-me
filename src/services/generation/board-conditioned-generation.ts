import type { FixedSourcePolicy, FixedSourceResult, FixedSourceRequest } from "../../infra/generation/openai-fixed-source";
import sharp from "sharp";
import { prepareBoardConditionedSource, type BoardConditioningInput } from "./board-conditioned-source";
import { BoardSpriteExtractionError, extractBoardSprites } from "./board-sprite-extraction";
import { composeBoardPlacement } from "./board-placement";
import type { ObservedBoardPoseSource } from "../../infra/generation/board-pose-observer";
import { sha256Bytes } from "./fixed-sprite";
import type { WorldBudget, WorldChargeEvidence } from "./world-budget";
import { prepareBoardPoseObservation, decideBoardPoseObservation, type BoardPoseObserverPolicy, type BoardPoseObservationReceipt, type BoardPoseCompletenessDeferral } from "../../infra/generation/board-pose-observer";

type GeneratedSource = Extract<FixedSourceResult, { kind: "generated" }>;
type Seed = ObservedBoardPoseSource;
export interface BoardMeasurement {
  sheetSha256: string;
  fingerprint: string;
  status: "ok" | "uncertain" | "invalid";
  sources: Seed[] | null;
  evidence: WorldChargeEvidence;
  receipt?: BoardPoseObservationReceipt;
  /** Cells whose visible completeness only the destination can settle. Optional
   * so measurements checkpointed before 9 September 2026 still load unchanged. */
  completenessDeferred?: BoardPoseCompletenessDeferral[];
}
export interface BoardConditionedCheckpointStore {
  /** Durable immutable put-if-absent. Same key with changed bytes must fail. */
  putSource(worldId: string, boardId: string, source: GeneratedSource): Promise<void>;
  getSource(worldId: string, boardId: string): Promise<GeneratedSource | null>;
  putMeasurement(worldId: string, boardId: string, result: BoardMeasurement, measurementAttempt?: 1 | 2): Promise<void>;
  getMeasurement(worldId: string, boardId: string, measurementAttempt?: 1 | 2): Promise<BoardMeasurement | null>;
}
export interface BoardGenerationDependencies {
  sourcePolicy: FixedSourcePolicy;
  observerPolicy: BoardPoseObserverPolicy;
  budget: WorldBudget;
  sources: { generate(request: FixedSourceRequest): Promise<FixedSourceResult> };
  checkpoints: BoardConditionedCheckpointStore;
  /** Adapter MUST use the same durable budget and reserve before its single HTTP attempt. */
  measure(input: { worldId: string; requestKey: string; sheetPng: Buffer; slots: { slotId: string; pose: string }[] }): Promise<BoardMeasurement | null>;
}

function demand(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`BOARD_GENERATION: ${message}`); }
async function assertRecordedCharge(deps: BoardGenerationDependencies, worldId: string, requestKey: string, fingerprint: string, evidence: WorldChargeEvidence) {
  const row = await deps.budget.readRequest(worldId, requestKey);
  demand(row && (row.state === "settled" || row.state === "linked")
    && row.evidence.providerNamespace === evidence.providerNamespace && row.evidence.providerRequestId === evidence.providerRequestId
    && row.evidence.amountMicroUsd === evidence.amountMicroUsd && row.evidence.model === evidence.model && row.operationFingerprint === fingerprint,
  "checkpoint has no matching durable charge; never treat a supplied image/measurement as a free API result");
  demand(!(await deps.budget.audit(worldId)).held, "world budget is held");
}

/**
 * One board of a child's world: board-conditioned LOW image -> observed actual
 * source -> exact alpha extraction -> authored placement. No fixed-v3 standing
 * masquerade, model-picked destination, legacy patcher, matte pass or auto retry.
 *
 * Deliberately stops at review; neither geometric success nor this return value
 * authorizes game release. Caller supplies authenticated job scope/checkpoints.
 */
export async function generateBoardConditionedAppearances(deps: BoardGenerationDependencies, request: {
  worldId: string; expectedContractSha256: string; input: BoardConditioningInput;
  /** One additional observation of the SAME paid sheet, never a source retry. */
  measurementAttempt?: 1 | 2;
}) {
  demand(/^[A-Za-z0-9_:-]{1,240}$/.test(request.worldId), "invalid world scope");
  const measurementAttempt = request.measurementAttempt ?? 1;
  demand(measurementAttempt === 1 || measurementAttempt === 2, "at most two observations of one paid source are allowed");
  const selection = measurementAttempt === 2 ? { measurementAttempt: 2 as const } : {};
  const prepared = await prepareBoardConditionedSource(request.input, deps.sourcePolicy);
  demand(prepared.contractSha256 === request.expectedContractSha256, "frozen child/board/pose/light intent changed");
  const { input, contract, contractSha256 } = prepared;
  const sourceKey = `board:${input.boardId}:source:1`, measureKey = `board:${input.boardId}:measure:${measurementAttempt}`;
  let source = await deps.checkpoints.getSource(request.worldId, input.boardId);
  demand(measurementAttempt === 1 || source, "re-observation requires the retained original paid source; image generation is forbidden");
  if (!source) {
    const answer = await deps.sources.generate({ worldId: request.worldId, requestKey: sourceKey, sourceGroupKey: prepared.prepared.capture.sourceGroupKey,
      prompt: prepared.prepared.prompt, stylePng: prepared.prepared.stylePng, identityPng: prepared.prepared.identityPng, expectedFingerprint: prepared.prepared.fingerprint });
    if (answer.kind === "already-recorded") return { state: "reconciliation-required" as const, boardId: input.boardId, contractSha256, stage: "source" as const, automaticRelease: false as const };
    source = answer;
    // A crash after billing but before this checkpoint cannot redispatch sourceKey.
    await deps.checkpoints.putSource(request.worldId, input.boardId, source);
  }
  demand(source.fingerprint === prepared.prepared.fingerprint && source.pngSha256 === sha256Bytes(source.png), "cached source bytes/child/board/light mapping changed");
  await assertRecordedCharge(deps, request.worldId, sourceKey, prepared.prepared.fingerprint, source.evidence);
  const slots = input.slots.map(item => ({ slotId: item.slot.id, pose: item.slot.pose }));
  const expectedObservation = await prepareBoardPoseObservation({ sheetPng: source.png, slots }, deps.observerPolicy);
  if (measurementAttempt === 2) {
    const original = await deps.checkpoints.getMeasurement(request.worldId, input.boardId, 1);
    demand(original && original.sheetSha256 === source.pngSha256 && original.fingerprint === expectedObservation.fingerprint
      && original.receipt?.responseText && original.receipt.fingerprint === expectedObservation.fingerprint
      && original.receipt.sourceImageSha256 === source.pngSha256, "re-observation requires the original immutable same-sheet receipt");
    await assertRecordedCharge(deps, request.worldId, `board:${input.boardId}:measure:1`, original.fingerprint, original.evidence);
  }
  let measurement = await deps.checkpoints.getMeasurement(request.worldId, input.boardId, measurementAttempt);
  if (!measurement) {
    measurement = await deps.measure({ worldId: request.worldId, requestKey: measureKey, sheetPng: source.png, slots });
    if (!measurement) return { state: "reconciliation-required" as const, boardId: input.boardId, contractSha256, stage: "measurement" as const, ...selection, automaticRelease: false as const };
    await deps.checkpoints.putMeasurement(request.worldId, input.boardId, measurement, measurementAttempt);
  }
  demand(measurement.sheetSha256 === source.pngSha256 && measurement.fingerprint === expectedObservation.fingerprint, "measurement belongs to a different source sheet or pose request");
  await assertRecordedCharge(deps, request.worldId, measureKey, measurement.fingerprint, measurement.evidence);
  const measuredSelection = measurementAttempt === 2 ? { measurementAttempt: 2 as const,
    measurementCharge: (await deps.budget.readRequest(request.worldId, measureKey))! } : {};
  // Re-evaluate a retained raw answer after a deterministic implementation fix.
  // Never change the immutable paid checkpoint or buy the measurement again.
  // Keep legacy decisions untouched; standing measurements use the same pure
  // decision function that the player independently replays before binding.
  if (slots.some(s => s.pose === "standing") && measurement.receipt?.responseText) {
    demand(measurement.receipt.fingerprint === expectedObservation.fingerprint
      && measurement.receipt.sourceImageSha256 === source.pngSha256, "retained observation does not bind this source");
    const decision = decideBoardPoseObservation(JSON.parse(measurement.receipt.responseText), slots, expectedObservation.rgba, { standingPixelSupportAtComposition: true });
    measurement = { ...measurement, status: decision.status, sources: decision.sources, completenessDeferred: decision.completenessDeferred };
  }
  if (measurement.status !== "ok" || !measurement.sources) return { state: "source-review-required" as const, boardId: input.boardId, contractSha256, source, measurement, ...measuredSelection, automaticRelease: false as const };
  demand(measurement.sources.length === 3 && new Set(measurement.sources.map(s => s.slotId)).size === 3
    && slots.every(slot => measurement.sources!.some(s => s.slotId === slot.slotId && s.pose === slot.pose)), "observed slot/pose map differs from the frozen board");
  let extracted;
  try {
    extracted = await extractBoardSprites({ sheetPng: source.png, expectedSheetSha256: source.pngSha256,
      seeds: measurement.sources.map(item => ({ ...item, measurement: { kind: "observed" as const, note: `Sol HIGH source observation ${measurement!.evidence.providerRequestId}; ${measurement!.fingerprint}` } })) });
  } catch (error) {
    if (!(error instanceof BoardSpriteExtractionError)) throw error;
    return { state: "source-review-required" as const, boardId: input.boardId, contractSha256, source, measurement, ...measuredSelection,
      extractionFailure: { code: error.code, evidence: error.evidence }, automaticRelease: false as const };
  }
  const appearances = [];
  for (const item of input.slots) {
    const sprite = extracted.sprites.find(s => s.slotId === item.slot.id)!;
    const placement = await composeBoardPlacement(input.board, item, sprite, measurement.sources.find(s => s.slotId === item.slot.id)!);
    // The source reviewer may have left this cell's visible completeness open.
    // Recording it here keeps the reason it passed legible: it passed because
    // the composite checks below cleared it at this exact destination, not
    // because anyone waived the question.
    const completenessDeferred = measurement.completenessDeferred?.find(d => d.slotId === item.slot.id) ?? null;
    if (placement === null) {
      appearances.push({ slotId: item.slot.id, state: "placement-review-required" as const,
        reason: item.slot.mode === "open" ? "Missing complete standing anatomy or authored support" : "No already-occluded lower cut at the frozen anchor and scale", sprite, completenessDeferred });
      continue;
    }
    const { composite } = placement;
    appearances.push({ slotId: item.slot.id, state: composite.ok ? "visual-review-required" as const : "placement-review-required" as const, sprite, composite, completenessDeferred });
  }
  const patches = appearances.flatMap(item => "composite" in item && item.composite ? [{ input: item.composite.patchPng, left: 0, top: 0 }] : []);
  const boardPreviewPng = await sharp(input.board.png).composite(patches).png().toBuffer();
  return { state: "review-required" as const, boardId: input.boardId, contract, contractSha256, source, measurement, extracted, appearances, boardPreviewPng, ...measuredSelection,
    previewIsDiagnostic: appearances.some(item => item.state !== "visual-review-required"),
    reviewDimensions: ["identity", "child-age", "pose", "local-scale", "contact-and-occlusion", "anatomy", "style", "local-lighting", "visual-integration"] as const,
    automaticRelease: false as const };
}

/** Preflight ALL boards before the first bill; each board still has its own source and lighting. */
export async function generateBoardConditionedWorld(deps: BoardGenerationDependencies, request: {
  worldId: string; boards: { expectedContractSha256: string; input: BoardConditioningInput }[];
  /** Explicit small QA slice; default is one board, resume does not buy it again. */
  maxBoards?: number;
}) {
  demand(request.boards.length >= 1 && request.boards.length <= 9 && new Set(request.boards.map(b => b.input.boardId)).size === request.boards.length, "one world must contain 1–9 distinct authored boards");
  const child = request.boards[0]!.input.child;
  demand(request.boards.every(b => b.input.child.profileId === child.profileId && b.input.child.ageYears === child.ageYears), "all boards must belong to the same child");
  const maxBoards = request.maxBoards ?? 1;
  demand(Number.isInteger(maxBoards) && maxBoards >= 1 && maxBoards <= 9, "maxBoards must be 1–9");
  for (const board of request.boards) demand((await prepareBoardConditionedSource(board.input, deps.sourcePolicy)).contractSha256 === board.expectedContractSha256, "world has stale board intent; no paid dispatch");
  const results = [];
  for (const board of request.boards.slice(0, maxBoards)) {
    const result = await generateBoardConditionedAppearances(deps, { ...board, worldId: request.worldId });
    results.push(result);
    if (result.state === "reconciliation-required") break;
  }
  return { version: "board-conditioned-world/v1" as const, worldId: request.worldId, results,
    reviewedPlayableGame: false as const, automaticRelease: false as const };
}
