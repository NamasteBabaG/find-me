import { z } from "zod";
import {
  evaluateFixedPlacement, fixedSlotV3ContractSchema, visibleSpriteSourceSchema,
  FixedSpriteError, sha256Bytes, sha256Rgba,
  type BoardIdentity, type ExtractedSprite, type FixedPlacement, type ForegroundRgba,
  type QaFlag, type SpriteTransform, type VisibleSpriteSource,
} from "./fixed-sprite";

const policySchema = z.object({
  version: z.literal("fixed-scale-solver/v1"),
  stepPx: z.number().finite().min(0.01).max(32).default(0.1),
  maxCandidates: z.number().int().min(3).max(65).default(65),
}).strict();

export type FixedScaleSolverPolicy = z.input<typeof policySchema>;
export interface FixedScaleSolverInput {
  contract: unknown;
  board: BoardIdentity;
  sprite: ExtractedSprite<VisibleSpriteSource>;
  foreground?: ForegroundRgba;
  /** Explicit opt-in: the existing validation tolerance is used as a search interval. */
  policy: FixedScaleSolverPolicy;
}
export interface FixedScaleAttempt {
  index: number;
  faceDistancePx: number;
  transform: SpriteTransform;
  geometryPassed: boolean;
  flags: QaFlag[];
  measurements: FixedPlacement["measurements"];
}
export interface FixedScaleSolution {
  status: "feasible-tested-candidate" | "no-feasible-tested-candidate";
  geometryPassed: boolean;
  placement: FixedPlacement | null;
  selectedAttemptIndex: number | null;
  targetAttempt: FixedScaleAttempt;
  attempts: FixedScaleAttempt[];
  search: {
    policy: z.output<typeof policySchema>;
    faceIntervalPx: { min: number; max: number };
    targetFaceDistancePx: number;
    sourceFaceDistancePx: number;
    plannedFaceDistancesPx: number[];
    uncappedCandidateCount: number;
    planTruncated: boolean;
    capStrategy: "reserve-target-and-endpoints-fill-nearest-grid";
    tieTolerancePx: 1e-10;
    stoppedAtFirstPassingCandidate: boolean;
    intervalExhaustivelyProven: false;
    selection: "closest-tested-to-target; equal-distance-prefers-smaller-face";
    support: "exact-authored-destination-no-drift";
  };
  provenance: {
    /** Hash of the validated recipe, as used by the evaluator (including schema defaults). */
    contractSha256: string;
    suppliedContractSha256: string;
    policySha256: string;
    board: BoardIdentity;
    sourceSheetRgbaSha256: string;
    extractionBinding: NonNullable<ExtractedSprite<VisibleSpriteSource>["extractionBinding"]>;
    foregroundRgbaSha256?: string;
  };
  semanticStatus: "pending";
  automaticRelease: false;
}

function hashJson(value: unknown): string { return sha256Bytes(Buffer.from(JSON.stringify(value))); }

/**
 * Research-only, explicitly selected policy; computeFixedPlacement is unchanged.
 * This samples a finite face-distance grid, not a continuous feasibility proof.
 * No support drift, slot replacement, source edits or constraint relaxation occurs.
 * The original target and both endpoints are retained even when the grid is capped.
 */
export function solveFixedScale(input: FixedScaleSolverInput): FixedScaleSolution {
  const policy = policySchema.parse(input.policy);
  const parsed = fixedSlotV3ContractSchema.safeParse(input.contract);
  if (!parsed.success) throw new FixedSpriteError("invalid_solver_contract", "The opt-in scale solver requires an unchanged fixed-sprite/v3 contract");
  const contract = parsed.data;
  const source = visibleSpriteSourceSchema.parse(input.sprite.source);
  const target = contract.scale.destinationDistancePx;
  const tolerance = contract.scale.tolerancePx;
  const min = target - tolerance;
  const max = target + tolerance;
  // There is no smallest positive scale. Do not fabricate epsilon as an endpoint
  // or quietly reinterpret a nonpositive interval as a narrower authored range.
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0) {
    throw new FixedSpriteError("invalid_solver_interval", "The opt-in solver requires two finite, strictly positive face-distance endpoints");
  }
  const sourceFaceDistancePx = Math.hypot(
    source.landmarks.chin.x * input.sprite.sourceWidth - source.landmarks.eyeMidpoint.x * input.sprite.sourceWidth,
    source.landmarks.chin.y * input.sprite.sourceHeight - source.landmarks.eyeMidpoint.y * input.sprite.sourceHeight,
  );
  if (!Number.isFinite(sourceFaceDistancePx) || sourceFaceDistancePx <= 0) throw new FixedSpriteError("invalid_scale_reference", "Visible source face distance must be finite and positive");
  const observedAnchor = contract.support.sourceLandmark === "soleMidpoint"
    ? { x: (source.landmarks.leftFoot.x + source.landmarks.rightFoot.x) / 2, y: (source.landmarks.leftFoot.y + source.landmarks.rightFoot.y) / 2 }
    : source.landmarks[contract.support.sourceLandmark];
  const anchor = { x: observedAnchor.x * input.sprite.sourceWidth, y: observedAnchor.y * input.sprite.sourceHeight };
  const destination = { x: contract.support.destination.x * contract.board.width, y: contract.support.destination.y * contract.board.height };

  const order = (a: number, b: number) => {
    const difference = Math.abs(a - target) - Math.abs(b - target);
    return Math.abs(difference) > 1e-10 ? difference : a - b;
  };
  const mandatory = new Set([target, min, max]);
  const grid = new Set(mandatory);
  // tolerance <=32 and step >=0.01 bound planning to at most6403 entries.
  for (let step = 1; step * policy.stepPx < tolerance; step++) {
    const offset = step * policy.stepPx;
    for (const candidate of [target - offset, target + offset]) {
      if (candidate >= min && candidate <= max) grid.add(candidate);
    }
  }
  const optional = [...grid].filter(value => !mandatory.has(value)).sort(order);
  const plannedFaceDistancesPx = [...mandatory, ...optional.slice(0, policy.maxCandidates - mandatory.size)].sort(order);
  // A tiny tolerance must not let the approximate tie-break move an endpoint
  // ahead of the nominal target, which always remains the first control.
  plannedFaceDistancesPx.splice(plannedFaceDistancesPx.indexOf(target), 1);
  plannedFaceDistancesPx.unshift(target);

  const attempts: FixedScaleAttempt[] = [];
  let placement: FixedPlacement | null = null;
  for (const faceDistancePx of plannedFaceDistancesPx) {
    const scale = faceDistancePx / sourceFaceDistancePx;
    const transform = { scale, translateX: destination.x - anchor.x * scale, translateY: destination.y - anchor.y * scale };
    // Every tested transform takes the full authoritative path, including source
    // QA, hash bindings, native/preview forbidden checks and foreground geometry.
    // Exceptions are fatal, never treated as an ordinary candidate failure.
    const evaluated = evaluateFixedPlacement({ contract, board: input.board, sprite: input.sprite, foreground: input.foreground, transform });
    attempts.push({ index: attempts.length, faceDistancePx, transform: evaluated.transform, geometryPassed: evaluated.ok, flags: evaluated.flags, measurements: evaluated.measurements });
    if (evaluated.ok) { placement = evaluated; break; }
  }
  const targetAttempt = attempts[0]!;
  return {
    status: placement ? "feasible-tested-candidate" : "no-feasible-tested-candidate",
    geometryPassed: Boolean(placement), placement, selectedAttemptIndex: placement ? attempts.length - 1 : null, targetAttempt, attempts,
    search: {
      policy, faceIntervalPx: { min, max }, targetFaceDistancePx: target, sourceFaceDistancePx,
      plannedFaceDistancesPx, uncappedCandidateCount: grid.size, planTruncated: grid.size > plannedFaceDistancesPx.length,
      capStrategy: "reserve-target-and-endpoints-fill-nearest-grid", tieTolerancePx: 1e-10,
      stoppedAtFirstPassingCandidate: Boolean(placement), intervalExhaustivelyProven: false,
      selection: "closest-tested-to-target; equal-distance-prefers-smaller-face", support: "exact-authored-destination-no-drift",
    },
    provenance: {
      contractSha256: hashJson(contract), suppliedContractSha256: hashJson(input.contract), policySha256: hashJson(policy),
      board: { ...input.board }, sourceSheetRgbaSha256: input.sprite.sourceSha256,
      extractionBinding: { ...input.sprite.extractionBinding! },
      ...(input.foreground ? { foregroundRgbaSha256: sha256Rgba(input.foreground.rgba, input.foreground.width, input.foreground.height) } : {}),
    },
    semanticStatus: "pending", automaticRelease: false,
  };
}
