import { nativeMaskTailMarkerSchema, nativeMaskTailDirections, nativeMaskTailEditRegion, type NativeMaskTailMarker } from "../../domain/generation/native-mask-tail";
import { GUIDED_FRAME_RECOVERY_VERSION, guidedFrameGeometry, guidedFrameOverlay, guidedFrameDirections, parseGuidedFrameMarker, type GuidedFrameMarker } from '../../domain/generation/guided-frame-recovery';
import { hasLocalPatchCapability } from "../../domain/scene/local-patch-family";
import { isCollectionVersion } from "../../domain/scene/local-patch-versions";
import { SUBJECT_PAINTER_V2, SUBJECT_PAINTER_V3, SUBJECT_PAINTER_V4, isPlanLedPainter, type SubjectPainterVersion } from "../../domain/generation/subject-painter";
import { localPatchReturnRegion, authoredLocalPatchReturnContract, AUTHORED_PATCH_COMPOSITION_VERSION, type AuthoredLocalPatchReturnContract, type LocalPatchCompositionVersion } from "../../domain/scene/local-patch-return-region";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { playerReviewEnabled } from "./local-patch-player-review";
import {
  LOCAL_PATCH_CROP, type LocalPatchBoard, type LocalPatchHide, cropOf, maskForHide,
} from "../../domain/scene/local-patch-hides";
import { analysePatchSeam, applyLocalPatch, composeBoundedLocalPatch, LOCAL_PATCH_COMPOSITION_VERSION, type LocalPatchCompositionPermission, type SeamReport } from "./local-patch-seam";
import {
  LOCAL_PATCH_JUDGE, localPatchJudgeSettings, judgeLocalPatch, localPatchJudgePrompt, parseLocalPatchVerdict,
  type JudgeWireFault, type LocalPatchJudgeRequest, type LocalPatchJudgeResult, type LocalPatchVerdict,
} from "./local-patch-judge";
import { judgeCharge } from "../../infra/generation/judge";
import { LOCAL_PATCH_POSE_WORDING, LOCAL_PATCH_PROMPT_VERSION, LOCAL_PATCH_BOARD_DRAWN_PROMPT_VERSION, LOCAL_PATCH_FIVE_PROMPT_VERSION, LOCAL_PATCH_CANONICAL_PROMPT_VERSION, LOCAL_PATCH_AGE_PROMPT_VERSION, LOCAL_PATCH_IDENTITY_LOCK_PROMPT_VERSION, LOCAL_PATCH_INTEGRATED_PROMPT_VERSION, LOCAL_PATCH_REFERENCE_NEUTRAL_PROMPT_VERSION, LOCAL_PATCH_BOARD_PAINT_PROMPT_VERSION, localPatchPrompt, type LocalPatchRepairCheck, type LocalPatchPaintRecipe } from "./local-patch-prompt";
import { purchaseOnce, type PurchaseLedger, type RetainedPurchaseStore } from "./paid-operation";
import { LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE, LOCAL_PATCH_PHOTO_REFERENCE_MODE, LOCAL_PATCH_IMAGE_POLICY, LOCAL_PATCH_LOW_IMAGE_POLICY, localPatchRenderPolicySha256, type LocalPatchPurchase, type LocalPatchReferenceMode } from "../../infra/generation/openai-local-patch";
import type { BudgetJson } from "./world-budget";
import { isLocalPatchAdvisoryVersion, isLocalPatchAgeVersion, isLocalPatchStrictVersion } from "../../domain/scene/local-patch-catalog";
import type { LocalPatchRecoveryDirective } from "../../domain/scene/local-patch-recovery-directive";
import { adaptiveRecoveryPrompt, type AdaptiveRecoveryPlan } from "./local-patch-adaptive-recovery";
import { selfRepairDecisionSchema, selfRepairRenderInstructions, type SelfRepairDecision } from "../../domain/scene/local-patch-self-repair";
import { retainedRestylePrompt } from "./local-patch-restyle";
import { ageBodyRequestDirections, LOCAL_PATCH_AGE_BODY_PROMPT_VERSION, LOCAL_PATCH_AGE_BODY_PROP_PROMPT_VERSION, LOCAL_PATCH_FIXED_SCENERY_PROMPT_VERSION, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION, referenceNeutralHairDirections } from "./local-patch-prompt";
import { foregroundForPinnedPrompt, foregroundPlanConflict, foregroundRecord, occludeLocalPatch, type LocalPatchForegroundRecord } from "./local-patch-foreground";
import { assertAuthoredLocalPatchPlacement, assertAuthoredLocalPatchRecoveryGeometry, expectedAuthoredLocalPatchReturn } from "./local-patch-authored-return";
import { assertTrustedSourcePlacementContext, sourcePlacementForHide, type TrustedSourcePlacementContext } from "./source-placement-release";
import { authoredRecoveryDiagnosisSchema, type AuthoredRecoveryDiagnosis } from "../../domain/scene/local-patch-authored-recovery";
import { prepareSourceNeighborContract } from "../../domain/scene/local-patch-source-neighbors";
import { fixedSourceFailureReceiptSchema, type FixedSourceFailureReceipt } from "../../infra/generation/fixed-source-diagnostics";

/**
 * One paid attempt at one hide, out of the scripts and into the product.
 *
 * Cut the crop, build the mask the pose needs, buy one render, check the seam,
 * composite only the declared rectangle, and judge the result once.
 *
 * BOTH purchases go through `purchaseOnce`, which is the point rather than
 * tidiness. The scripts budgeted the render and left the judgement outside, so a
 * ledger read 29.60c for a round that had cost 38.85c - and they kept the bytes
 * after settling rather than before, so an interruption between paying and
 * writing left money spent with nothing to show for it. One boundary means a
 * judgement is a purchase like any other, the bytes and the bill are retained
 * together before the ledger is settled, and a replay has to prove it is the
 * same operation before it may answer.
 *
 * A replayed judgement is RE-DERIVED from the retained reply rather than read
 * from a stored verdict. The rules have been corrected more than once - a fault
 * nobody could route, a check saying `unsure` beside a described defect - and
 * re-deriving is how those corrections reach answers already paid for, free.
 */

export type LocalPatchRenderDeps = {
  readonly ledger: PurchaseLedger;
  readonly store: RetainedPurchaseStore;
  /**
   * The image model and settings this adapter buys under, as a digest.
   *
   * Part of the render fingerprint, because they decide what comes back: a
   * different model, quality or size is a different purchase and must never
   * replay the previous one. The adapter owns the settings; it does not get to
   * leave them out of the identity of what it bought.
   */
  readonly renderPolicySha256: string;
  /**
   * Buys one render. Sizes and fingerprint verification are the adapter's.
   *
   * It may hand back an image whose charge it cannot state - a reply that was
   * billed and whose usage could not be read is exactly that - and saying so is
   * not the same as failing. Throwing there would lose a picture that was paid
   * for, which is the mistake this whole route exists to stop making.
   */
  readonly render: (input: {
    readonly worldId: string; readonly requestKey: string; readonly prompt: string;
    readonly stylePng: Buffer; readonly identityPng: Buffer; readonly maskPng: Buffer;
    readonly placementGuidePng?: Buffer; readonly placementGuideVersion?: typeof GUIDED_FRAME_RECOVERY_VERSION;
    readonly referenceMode?: LocalPatchReferenceMode;
    readonly subjectPhotoPng?: Buffer;
    readonly subjectQuality?: "low" | "medium";
    readonly canonicalIdentityPng?: Buffer;
    readonly boardPeoplePng?: Buffer;
    /** What is left of the caller's request. An adapter that ignores it can outlive it. */
    readonly timeoutMs?: number;
  }) => Promise<LocalPatchPurchase>;
  /** Overridable so a test can answer without a network. */
  readonly judge?: (request: LocalPatchJudgeRequest) => Promise<LocalPatchJudgeResult>;
};

export type SubjectRenderDirection = { readonly text: string; readonly wardrobe?: string; readonly sha256: string;
  readonly photoPng: Buffer; readonly photoSha256: string; readonly policySha256: string; readonly quality: "low" | "medium";
  readonly painterVersion?: SubjectPainterVersion };

export type LocalPatchAttemptInput = {
  /** Persisted recipe, checked before any paid operation or scene decoding. */
  readonly expectedPromptVersion?: string;
  readonly paintRecipe?: LocalPatchPaintRecipe;
  readonly contentVersion?: number;
  readonly worldId: string;
  readonly board: LocalPatchBoard;
  readonly hide: LocalPatchHide;
  /** The board as it now stands, with any earlier hides already painted in. */
  readonly composedPng: Buffer;
  /** Only authored v4 windows require the source manifest authenticated by the caller. */
  readonly authoredSource?: { readonly sha256: string; readonly width: number; readonly height: number };
  readonly placementContext?: TrustedSourcePlacementContext;
  /** New companion recovery only; frozen paid diagnosis, never provider prose. */
  readonly authoredDiagnosis?: AuthoredRecoveryDiagnosis;
  /** Bounded one-world LOW recovery; never changes the authored source or window. */
  readonly guidedFrameRecovery?: GuidedFrameMarker;
  readonly nativeMaskTail?: NativeMaskTailMarker;
  readonly identityPng: Buffer;
  readonly referenceMode?: LocalPatchReferenceMode;
  readonly canonicalIdentityPng?: Buffer;
  readonly boardPeoplePng?: Buffer;
  /** For the judge, which needs a smaller copy than the painter does. */
  readonly judgeIdentityPng: Buffer;
  /** Stated by the parent. Never guessed; left out when unknown. */
  readonly ageYears?: number | null;
  /** Normal 1–2, final QA repair 3. A distinct key, never a reset of a paid attempt. */
  readonly attempt: number;
  readonly repairChecks?: readonly LocalPatchRepairCheck[];
  /** Trusted caller validates the immutable extra-attempt grant first. */
  readonly recoveryDirective?: LocalPatchRecoveryDirective;
  readonly adaptiveRecovery?: AdaptiveRecoveryPlan;
  /** Separate durable recovery key; never repurposes a historical purchase. */
  readonly selfRepair?: { readonly cycle: number; readonly decision: SelfRepairDecision };
  /** Authenticated retained source for a v12 surface-only recovery. */
  readonly restyleSourcePng?: Buffer;
  /** An enrolled world's subject plan for this appearance (subject-policy.ts), appended to the
   * pinned recipe and bound into the fingerprint. Absent: every historical purchase, byte for byte. */
  readonly subjectDirection?: SubjectRenderDirection & {
    /** Exact former directions (newest first) for replay only; never selected for a new purchase. */
    readonly legacy?: SubjectRenderDirection | readonly SubjectRenderDirection[] };
  readonly apiKey: string;
  /**
   * When this worker's request is going to be taken away from it, absolute.
   *
   * Each paid phase here is allowed four minutes of its own, and the route that
   * calls it declares five for the whole request - so a render that used most of
   * its allowance and a judgement that then started at all could not both finish.
   * Checked BEFORE each dispatch, never after: the point is not to notice the
   * overrun, it is to not start something that cannot end.
   */
  readonly deadlineAt?: number;
};

export type LocalPatchAttempt = {
  readonly accepted: boolean;
  /**
   * Why not, when not. `wire` is a reply that could not be trusted; `stopped` is
   * a purchase that could not go ahead - a reservation somebody else holds, a
   * charge nobody can describe, a request whose inputs changed - and neither is
   * a statement about the picture.
   */
  readonly refusedBecause: "judge" | "wire" | "render" | "stopped" | null;
  readonly stoppedReason: string | null;
  /**
   * Why the painted image itself could not be used, when it could not.
   *
   * Distinct from `stoppedReason`: this attempt DID buy something and the thing
   * it bought is no good, so the attempt is concluded and the next one may run.
   * A stop is the opposite - nothing was learned about the picture.
   */
  readonly renderFault: string | null;
  readonly patchPng: Buffer | null;
  /**
   * The crop as it would ship: composited back, fade and all. These are the
   * exact bytes `judgedSha256` is of and the exact bytes the judge was shown,
   * so what gets stored is what was judged rather than something recomputed
   * later that only ought to match. Present for a refusal too - a render nobody
   * can look at afterwards is a render nobody can learn from.
   */
  readonly shippingPng: Buffer | null;
  /** The whole board with this hide painted in. Only present when accepted. */
  readonly composedPng: Buffer | null;
  readonly seam: SeamReport | null;
  /** v8 local blend permission only; never substitutes for final visual review. */
  readonly compositionPermission?: LocalPatchCompositionPermission;
  readonly compositionVersion?: LocalPatchCompositionVersion;
  readonly authoredReturn?: AuthoredLocalPatchReturnContract;
  /** v18 rows of a hide with an authored outline: what was restored, bound to `shippingPng`. */
  readonly foreground?: LocalPatchForegroundRecord;
  readonly verdict: LocalPatchVerdict | null;
  readonly wireFault: JudgeWireFault | null;
  readonly promptVersion: string;
  /** The crop this attempt would ship, bound to the verdict that judged it. */
  readonly judgedSha256: string | null;
  readonly renderCents: number;
  readonly judgeCents: number;
  readonly costUnknown: boolean;
  /** True when nothing was bought: both purchases came back from the ledger. */
  readonly replayed: boolean;
  /**
   * A reservation is held for something that was never dispatched, and only a
   * person can resolve it.
   *
   * Separate from every other refusal because it is the only one that does not
   * get better by waiting: the money is committed, no charge happened, and a
   * later tick cannot tell this reservation from a worker still waiting on a
   * provider. Whoever reads this has to stop asking and say so.
   */
  readonly needsOperator: boolean;
};

/** What to hold while a render or a judgement is in flight. */
export const LOCAL_PATCH_RESERVE = Object.freeze({ renderMicroUsd: 120_000, judgeMicroUsd: 40_000 });

/**
 * Room after a phase's own timeout for keeping what it bought.
 *
 * The dangerous moment is not the dispatch, it is the write that follows it: a
 * host that stops the request between paying and retaining leaves a charge
 * nobody can reconcile. This is the margin that keeps that write inside the
 * request, and it is deliberately generous.
 */
export const LOCAL_PATCH_PHASE_MARGIN_MS = 25_000;

/** Minimum useful provider window, not the provider's maximum timeout.
 * Requiring 240s + retention inside a 270s request left only five seconds for
 * identity/art/ledger preparation and deferred every real DB-backed attempt.
 * Dispatch still receives the actual remaining time; the painter caps it at
 * its unchanged maximum. Retention keeps its full margin on both phases. */
export const LOCAL_PATCH_MIN_PROVIDER_MS = Object.freeze({ render: 150_000, judge: 60_000 });

/**
 * Nothing was bought and nothing was learned: there was not enough of this
 * request left to finish a phase that had not started.
 *
 * A stop, not a refusal - the attempt stays unconcluded, so the next tick
 * resumes THIS attempt, replays whatever was already retained and buys only
 * what is still missing. A deferral must never cost an attempt.
 */
const deferred = (reason: string, renderCents = 0): LocalPatchAttempt =>
  ({ ...stopped(reason, renderCents, false) });

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const fingerprintOf = (parts: unknown) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

/**
 * The mask handed to the painter: opaque everywhere but the pose's own box,
 * which is transparent, because transparent is the part the edits route may
 * paint.
 *
 * The shape punching the hole has to be OPAQUE. `dest-out` keeps the
 * destination where the source is transparent and removes it where the source
 * is opaque, so a transparent stamp removes nothing - and every mask sent for
 * this world was built with a transparent stamp, which made it 512x768 of solid
 * alpha with no editable region at all. The renders that came back were the
 * model following the prose, with the mask contributing nothing.
 */
export async function poseMask(hide: LocalPatchHide): Promise<Buffer> {
  const box = maskForHide(hide);
  const hole = await sharp({ create: { width: box.width, height: box.height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } } }).png().toBuffer();
  const mask = await sharp({ create: { ...LOCAL_PATCH_CROP, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } })
    .composite([{ input: hole, left: box.left, top: box.top, blend: "dest-out" }]).png().toBuffer();
  // A mask with nothing to paint in is not a mask, and it costs a render to find
  // that out at the provider. Cheap to check here, so it is checked here.
  const { data, info } = await sharp(mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let clear = 0;
  for (let i = 3; i < data.length; i += info.channels) if (data[i]! === 0) clear++;
  if (clear !== box.width * box.height) {
    throw new Error(`LOCAL_PATCH: the mask for ${hide.id} has ${clear} paintable pixels, expected ${box.width * box.height}`);
  }
  return mask;
}

/** What the judge is shown: the hide and a hand's width of its surroundings. */
async function viewAround(png: Buffer, crop: { left: number; top: number; width: number; height: number }, board: { width: number; height: number }) {
  const pad = 120;
  const left = Math.max(0, crop.left - pad), top = Math.max(0, crop.top - pad);
  return sharp(png, { limitInputPixels: 8_294_400 }).extract({
    left, top,
    width: Math.min(crop.width + pad * 2, board.width - left),
    height: Math.min(crop.height + pad * 2, board.height - top),
  }).resize(768, 768, { fit: "inside" }).png().toBuffer();
}

/**
 * What a render purchase keeps.
 *
 * An envelope rather than the raw PNG, for the same reason the judgement keeps
 * its reply rather than its verdict: whether the picture may be used is a
 * CONCLUSION, and a conclusion that lives only in the process that drew it is
 * one a restart reaches differently. A refused render keeps its bytes here as
 * evidence, and every later pass reads the same refusal for free.
 */
export const RETAINED_RENDER_VERSION = "local-patch-render/v1";

type RetainedRender = {
  readonly failureReceipt?: FixedSourceFailureReceipt;
  readonly version: typeof RETAINED_RENDER_VERSION;
  /** Base64 of what came back, whether it may be drawn or not. */
  readonly bytesBase64: string | null;
  /** Null when the bytes are a usable patch; why not, otherwise. */
  readonly rejected: string | null;
  readonly authoredReturn?: AuthoredLocalPatchReturnContract;
  readonly authoredDiagnosis?: AuthoredRecoveryDiagnosis;
};

/** The part of a judge's reply worth keeping: enough to re-derive the verdict. */
type RetainedJudgement = {
  raw: string | null; usage: Record<string, unknown> | null; requestId: string | null;
  model: string | null; finishReason: string | null; wireFault: JudgeWireFault | null;
};

/**
 * A purchase that could not go ahead. `costUnknown` defaults to TRUE, because
 * every route here is one where money may have moved and cannot be described:
 * reporting certainty by default is how an unresolved charge became a zero.
 */
const stopped = (reason: string, renderCents = 0, costUnknown = true): LocalPatchAttempt => ({
  accepted: false, refusedBecause: "stopped", stoppedReason: reason, renderFault: null,
  patchPng: null, shippingPng: null, composedPng: null, seam: null, verdict: null, wireFault: null,
  promptVersion: LOCAL_PATCH_PROMPT_VERSION, judgedSha256: null,
  renderCents, judgeCents: 0, costUnknown, replayed: false, needsOperator: false,
});

/** Reserved and never dispatched. Nothing was charged; a person has to unstick it. */
const heldForOperator = (reason: string, renderCents = 0): LocalPatchAttempt =>
  ({ ...stopped(reason, renderCents, false), needsOperator: true });

/**
 * Bought, and not a picture anybody can use. The charge is settled and known;
 * this attempt is finished and the next one may run.
 */
const refusedRender = (fault: string, renderCents: number): LocalPatchAttempt => ({
  accepted: false, refusedBecause: "render", stoppedReason: null, renderFault: fault,
  patchPng: null, shippingPng: null, composedPng: null, seam: null, verdict: null, wireFault: null,
  promptVersion: LOCAL_PATCH_PROMPT_VERSION, judgedSha256: null,
  renderCents, judgeCents: 0, costUnknown: false, replayed: false, needsOperator: false,
});

export async function renderLocalPatchHide(deps: LocalPatchRenderDeps, input: LocalPatchAttemptInput): Promise<LocalPatchAttempt> {
  if (input.expectedPromptVersion !== undefined && input.expectedPromptVersion !== promptVersionOf(input)) {
    throw new Error(`LOCAL_PATCH: prompt provenance conflict; stored ${input.expectedPromptVersion}, selected ${promptVersionOf(input)}`);
  }
  if (input.contentVersion === 13 && (input.paintRecipe !== "scene-integration-v8" || deps.renderPolicySha256 !== localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY)))
    throw Error("LOCAL_PATCH: Detective painting requires its pinned v19 MEDIUM recipe");
  if (hasLocalPatchCapability(input.contentVersion, "requiresFamilyPin") && !input.placementContext)
    throw Error("LOCAL_PATCH: Detective rendering requires its trusted source-family context");
  if (input.placementContext) {
    assertTrustedSourcePlacementContext(input.placementContext);
    if (input.worldId !== `${input.placementContext.gameId}:board-wizard` || input.contentVersion !== input.placementContext.sceneVersion)
      throw Error("LOCAL_PATCH: authored render context belongs to another game/version");
    assertAuthoredLocalPatchPlacement(input.board, input.hide, input.contentVersion!, input.placementContext);
  }
  if (input.hide.returnRect) {
    if (!hasLocalPatchCapability(input.contentVersion, "integratedQuality") || input.recoveryDirective)
      throw Error("LOCAL_PATCH: authored return windows require their pinned v12 recipe");
    localPatchReturnRegion(cropOf(input.hide), maskForHide(input.hide), input.hide.returnRect);
  }
  const authoredReturn = input.hide.returnRect ? input.placementContext
    ? expectedAuthoredLocalPatchReturn(input.board, input.hide, input.contentVersion!, input.placementContext)!
    : authoredLocalPatchReturnContract({ contentVersion: input.contentVersion!, boardId: input.board.board, hideId: input.hide.id,
      source: { art: input.board.art, sha256: input.authoredSource?.sha256 ?? "", width: input.authoredSource?.width ?? 0,
        height: input.authoredSource?.height ?? 0 }, crop: cropOf(input.hide), child: maskForHide(input.hide), authored: input.hide.returnRect }) : undefined;
  if (authoredReturn && input.authoredSource && (input.authoredSource.sha256 !== authoredReturn.source.sha256
    || input.authoredSource.width !== authoredReturn.source.width || input.authoredSource.height !== authoredReturn.source.height))
    throw Error("LOCAL_PATCH: authored source differs from the trusted context");
  if (authoredReturn && input.selfRepair) {
    assertAuthoredLocalPatchRecoveryGeometry(authoredReturn, input.placementContext, input.selfRepair.decision);
    authoredRecoveryDiagnosisSchema.parse(input.authoredDiagnosis);
  } else if (input.authoredDiagnosis !== undefined) throw Error("LOCAL_PATCH: authored diagnosis requires an authored recovery");
  if (input.guidedFrameRecovery && (!parseGuidedFrameMarker(input.guidedFrameRecovery) || input.contentVersion !== 13 || (input.nativeMaskTail ? input.attempt !== 4 : input.attempt !== 3)
    || !authoredReturn?.sourcePlacement || input.selfRepair || input.adaptiveRecovery || input.recoveryDirective))
    throw Error('GUIDED_FRAME: only a trusted original-geometry third painting may use this guide');
  if (input.nativeMaskTail && (!nativeMaskTailMarkerSchema.safeParse(input.nativeMaskTail).success || !input.guidedFrameRecovery
    || input.nativeMaskTail.previousAuthorizationSha256 !== input.guidedFrameRecovery.authorizationSha256)) throw Error("NATIVE_MASK_TAIL: exact finite allowance and original guide required");
  const result = await renderLocalPatchHideInner(deps, input, authoredReturn);
  return { ...result, promptVersion: promptVersionOf(input), ...(authoredReturn ? { authoredReturn } : {}),
    ...(isLocalPatchStrictVersion(input.contentVersion) ? { compositionVersion: input.hide.returnRect ? AUTHORED_PATCH_COMPOSITION_VERSION : LOCAL_PATCH_COMPOSITION_VERSION } : {}) };
}

function promptVersionOf(input: LocalPatchAttemptInput): string {
  if (input.paintRecipe === "scene-integration-v8") return LOCAL_PATCH_FIXED_SCENERY_PROMPT_VERSION;
  if (input.paintRecipe === "scene-integration-v7") return LOCAL_PATCH_FOREGROUND_PROMPT_VERSION;
  if (input.paintRecipe === "scene-integration-v6") return LOCAL_PATCH_AGE_BODY_PROP_PROMPT_VERSION;
  if (input.paintRecipe === "scene-integration-v5") return LOCAL_PATCH_AGE_BODY_PROMPT_VERSION;
  if (input.paintRecipe === "scene-integration-v4") return LOCAL_PATCH_REFERENCE_NEUTRAL_PROMPT_VERSION;
  if (input.paintRecipe === "scene-integration-v3") return LOCAL_PATCH_INTEGRATED_PROMPT_VERSION;
  if (input.paintRecipe === "identity-body-v2") return LOCAL_PATCH_IDENTITY_LOCK_PROMPT_VERSION;
  if (input.paintRecipe === "board-paint-v1") return LOCAL_PATCH_BOARD_PAINT_PROMPT_VERSION;
  if (isLocalPatchAgeVersion(input.contentVersion)) return LOCAL_PATCH_AGE_PROMPT_VERSION;
  return isLocalPatchStrictVersion(input.contentVersion) ? LOCAL_PATCH_CANONICAL_PROMPT_VERSION
    : isLocalPatchAdvisoryVersion(input.contentVersion) ? LOCAL_PATCH_FIVE_PROMPT_VERSION
    : input.boardPeoplePng ? LOCAL_PATCH_BOARD_DRAWN_PROMPT_VERSION : LOCAL_PATCH_PROMPT_VERSION;
}

async function renderLocalPatchHideInner(deps: LocalPatchRenderDeps, input: LocalPatchAttemptInput, authoredReturn?: AuthoredLocalPatchReturnContract): Promise<LocalPatchAttempt> {
  const { worldId, board, hide, attempt } = input;
  if (isLocalPatchAgeVersion(input.contentVersion)) {
    if (input.referenceMode !== LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE || input.canonicalIdentityPng || input.boardPeoplePng) {
      throw new Error("LOCAL_PATCH: v9 requires portrait-only references, with no unrelated face atlas or old body sheet");
    }
  } else if (input.referenceMode !== undefined) {
    throw new Error("LOCAL_PATCH: portrait-only references belong to v9, not a legacy paid recipe");
  } else if (isLocalPatchStrictVersion(input.contentVersion) && (!input.canonicalIdentityPng || !input.boardPeoplePng)) {
    throw new Error("LOCAL_PATCH: canonical identity and board environment references are required before purchasing v8");
  }
  const crop = cropOf(hide);
  const promptVersion = promptVersionOf(input);
  // Validated here, before anything is bought; an invalid outline throws rather than being skipped.
  const foreground = isLocalPatchStrictVersion(input.contentVersion) ? foregroundForPinnedPrompt(hide, promptVersion) : null;
  if (input.selfRepair && (!isCollectionVersion(input.contentVersion) || !Number.isSafeInteger(input.selfRepair.cycle)
    || input.selfRepair.cycle < 1 || input.adaptiveRecovery || input.recoveryDirective)) throw Error("Invalid autonomous render recipe");
  const recovery = input.selfRepair ? selfRepairDecisionSchema.parse(input.selfRepair.decision) : null;
  // A recovery plan replaces the authored envelope with its own protected child, which
  // the outline must clear too. Refused here, before anything is reserved; the
  // self-repair phases refuse it first and return to diagnosis.
  const conflict = recovery && foreground ? foregroundPlanConflict(foreground, recovery) : null;
  if (conflict) throw new Error(`LOCAL_PATCH_FOREGROUND: ${hide.id}: ${conflict}`);
  const restyling = recovery?.action === "restyle-retained";
  if (restyling ? !hasLocalPatchCapability(input.contentVersion, "integratedQuality") || !input.restyleSourcePng?.length : input.restyleSourcePng !== undefined)
    throw Error("Retained surface repair requires a v12 diagnosis and authenticated source");
  const authoredMask = recovery?.protectedCore ?? maskForHide(hide);
  const guideGeometry = input.guidedFrameRecovery ? guidedFrameGeometry(authoredMask, authoredReturn!.local) : null;
  const mask = authoredMask;
  const paintTarget = guideGeometry?.target ?? mask;
  if (input.adaptiveRecovery && (attempt !== 3 || !isLocalPatchStrictVersion(input.contentVersion) || input.recoveryDirective)) {
    throw Error("ADAPTIVE_RECOVERY: a diagnosis belongs only to its final normal attempt");
  }
  const restylePrompt = restyling ? retainedRestylePrompt(recovery) : null;
  const recipeFor = (wardrobe: string | undefined, subjectPainter?: SubjectPainterVersion) => {
    const recipePrompt = restylePrompt !== null ? restylePrompt : localPatchPrompt({ ground: board.ground, pose: hide.pose, ageYears: input.ageYears, repairChecks: input.repairChecks, boardPeopleReference: !!input.boardPeoplePng,
      wardrobe, placement: hide.placement, mask: paintTarget, contentVersion: input.contentVersion,
      hideId: hide.id, recoveryDirective: input.recoveryDirective, paintRecipe: input.paintRecipe, ...(subjectPainter ? { subjectPainter } : {}) })
      + (input.adaptiveRecovery ? `\n\n${adaptiveRecoveryPrompt(input.adaptiveRecovery, hide)}` : "")
      // v2 keeps its own boolean wording byte for byte; v3 has its own.
      // v4 repairs in v3's words: the pose follows the subject direction.
      + (recovery ? `\n\n${selfRepairRenderInstructions(recovery, subjectPainter === SUBJECT_PAINTER_V3 || subjectPainter === SUBJECT_PAINTER_V4 ? "v3" : subjectPainter === SUBJECT_PAINTER_V2)}` : "");
    return input.paintRecipe === "scene-integration-v4" ? referenceNeutralHairDirections(recipePrompt)
      : input.paintRecipe === "scene-integration-v5" || input.paintRecipe === "scene-integration-v6" || input.paintRecipe === "scene-integration-v7"
        || input.paintRecipe === "scene-integration-v8"
        ? ageBodyRequestDirections(recipePrompt) : recipePrompt;
  };
  const authoredWardrobe = hide.wardrobe ?? board.wardrobe;
  const legacy = input.subjectDirection?.legacy;
  const directions = input.subjectDirection ? [input.subjectDirection, ...(Array.isArray(legacy) ? legacy : legacy ? [legacy as SubjectRenderDirection] : [])] : [];
  if (directions.some(direction => !hasLocalPatchCapability(input.contentVersion, "integratedQuality") || restyling || !direction.text.trim()
    || direction.painterVersion !== undefined && !isPlanLedPainter(direction.painterVersion)
    || sha(direction.photoPng) !== direction.photoSha256 || !["low", "medium"].includes(direction.quality)
    || direction.policySha256 !== localPatchRenderPolicySha256(direction.quality === "low" ? LOCAL_PATCH_LOW_IMAGE_POLICY : LOCAL_PATCH_IMAGE_POLICY)
    || createHash("sha256").update(JSON.stringify([direction.text, direction.wardrobe ?? null,
      direction.photoSha256, direction.policySha256, direction.quality])).digest("hex") !== direction.sha256))
    throw Error("LOCAL_PATCH: a subject plan belongs only to a v12 painting and must match its digest");
  // The painter sees only the crop. A source person clipped by that view is
  // still present in the canonical board outside it; completing that person by
  // shifting a new copy into the crop creates a double at the actual return.
  // This prospective companion direction is absent from every old paid prompt.
  const companion = authoredReturn?.sourcePlacement && input.placementContext
    ? sourcePlacementForHide(input.placementContext, hide.id) : null;
  const paintReturn = recovery?.returnWindow ?? authoredReturn?.local;
  const neighborContext = companion && paintReturn ? { boardId: companion.boardId, hideId: companion.hideId,
    source: companion.source, crop, returnRect: paintReturn } : null;
  const painterNeighbors = companion?.sourceNeighbors && neighborContext
    ? prepareSourceNeighborContract({ ...companion.sourceNeighbors.contract, ...neighborContext }, neighborContext) : null;
  if (painterNeighbors && !painterNeighbors.ok) throw Error("LOCAL_PATCH: painter return crosses an authoritative source head");
  const nativeEdit = input.nativeMaskTail ? nativeMaskTailEditRegion(authoredMask, authoredReturn!.local,
    painterNeighbors?.ok ? painterNeighbors.contract.neighbors.map(n => ({ ...n.head, left:n.head.left-crop.left, top:n.head.top-crop.top })) : []) : null;
  const authoredPaint = companion ? [
    "SOURCE-BOUND PAINTER local-patch-authored-paint/v1. This is a crop of the SAME continuous original scene, not a standalone picture to reframe or complete.",
    `AUTHORITATIVE PLACEMENT DATA: ${JSON.stringify({ source: companion.source, crop, childEnvelope: paintTarget,
      returnWindow: paintReturn, ...(nativeEdit ? { nativeEditEnvelope: nativeEdit.editable } : {}), sourcePlacement: authoredReturn!.sourcePlacement,
      sourceNeighbors: painterNeighbors?.ok ? { contractSha256: painterNeighbors.contractSha256,
        heads: painterNeighbors.contract.neighbors.map(n => ({ sourceId: n.sourceId,
          head: { ...n.head, left: n.head.left - crop.left, top: n.head.top - crop.top } })) } : null })}.`,
    "All child/return/head coordinates above use the original 512x768 crop; negative or outside head coordinates are intentional. Paint the canonical TARGET child only within childEnvelope. The returnWindow is the exact area that will join back into the original board; its exterior is never replaced.",
    "The registered heads identify original people for comparison, not a required final person count. Replace the authored TARGET with the canonical child. A source person wholly covered by the opaque return may be coherently removed or replaced WHOLE, with no original face, body or limb remnant; complete replacement is not a defect by itself.",
    "For every person continuing outside returnWindow, preserve their original scene coordinates, visible contours and anatomy. A person partly cut off by the INPUT CROP continues outside it in the original board: preserve that visible fragment exactly. Never complete a crop-clipped person by moving their head or body inward, inventing a foreground copy, erasing only half of them, or leaving their original head/face/body fragment beside a shifted replacement. Preserve continuous scenery across the return boundary.",
    "Do not move or widen the crop/window to solve a defect. If a complete target or intact neighbour cannot fit, the result must fail independent review and return to the bounded recovery plan; this direction is never an approval.",
  ].join("\n") : "";
  /** The pinned recipe alone, or with the subject plan (and its wardrobe in place of the authored one). */
  const promptWith = (plan: SubjectRenderDirection | undefined) => {
    const base = plan ? `${recipeFor(plan.wardrobe ?? authoredWardrobe, plan.painterVersion)}\n\n${plan.text}` : recipeFor(authoredWardrobe);
    const directed = authoredPaint ? `${base}\n\n${authoredPaint}` : base;
    if (!guideGeometry) return directed;
    const guide = guidedFrameDirections(authoredMask, authoredReturn!.local);
    const permission = input.nativeMaskTail ? guide.replace("The editor mask covers the orange context so surrounding scenery can be reconstructed coherently, but the child must stay inside cyan.",
      "The native editor mask covers only the ORIGINAL child envelope. Remove the original target person WHOLE inside that envelope, including hair above cyan, then draw the whole new child inside cyan. The orange return-boundary band is protected.") : guide;
    return directed + '\n\n' + permission + (input.nativeMaskTail ? '\n\n'+nativeMaskTailDirections : '');
  };

  const meta = await sharp(input.composedPng, { limitInputPixels: 8_294_400 }).metadata();
  if (authoredReturn && (meta.width !== authoredReturn.source.width || meta.height !== authoredReturn.source.height))
    throw Error("LOCAL_PATCH: authored source pixels differ from the pinned dimensions");
  const stylePng = restyling ? await sharp(input.restyleSourcePng!, { limitInputPixels: 8_294_400 }).resize(512, 768, { fit: "fill" }).png().toBuffer()
    : await sharp(input.composedPng, { limitInputPixels: 8_294_400 }).extract(crop).png().toBuffer();
  // The already drawn target is its own locator during surface repair. Supplying
  // another large portrait encouraged the painter to put its face on a neighbour.
  // The independent final review still compares against the canonical identity.
  const renderIdentityPng = restyling ? await sharp(stylePng).extract(mask).png().toBuffer() : input.identityPng;
  // Editing context and target placement differ: repaint only the existing returned context,
  // and keep the whole target within its unchanged authored envelope via the cyan guide.
  const maskPng = await poseMask(guideGeometry ? { ...hide, mask: nativeEdit ? nativeEdit.editable : authoredReturn!.local } : recovery ? { ...hide, mask } : hide);
  const placementGuidePng = guideGeometry ? await sharp(stylePng).composite([{ input:Buffer.from(guidedFrameOverlay(authoredMask,authoredReturn!.local)) }]).png().toBuffer() : undefined;

  const renderKey = input.selfRepair ? `${hide.id}:${hide.pose}:self-repair:${input.selfRepair.cycle}` : `${hide.id}:${hide.pose}:render:${attempt}`;
  // Everything that decides what is being bought. A different photograph,
  // prompt, mask or crop is a different purchase and must never replay this one.
  const fingerprintFor = (prompt: string, plan: SubjectRenderDirection | undefined) => fingerprintOf({
    version: promptVersion, hide: hide.id, pose: hide.pose, crop,
    prompt: sha(Buffer.from(prompt)), style: sha(stylePng), identity: sha(renderIdentityPng), mask: sha(maskPng),
    ...(restyling ? { canonicalGeometry: sha(input.identityPng) } : {}),
    ...(input.boardPeoplePng ? { boardPeople: sha(input.boardPeoplePng) } : {}),
    ...(input.canonicalIdentityPng ? { canonicalIdentity: sha(input.canonicalIdentityPng) } : {}),
    ...(plan ? { referenceMode: LOCAL_PATCH_PHOTO_REFERENCE_MODE }
      : input.referenceMode ? { referenceMode: input.referenceMode } : {}),
    ...(isLocalPatchStrictVersion(input.contentVersion) ? { composition: "bounded-return/v1" } : {}),
    ...(authoredReturn ? { authoredReturn } : {}),
    policy: plan?.policySha256 ?? deps.renderPolicySha256,
    // The SHAPE of what is kept, not only what was bought. A record written
    // before this envelope existed would otherwise be read under this same
    // fingerprint and come out "cannot be read" - a good paid picture called a
    // bad one. A different shape is a different operation, which is a thing for
    // a person rather than a verdict.
    retained: RETAINED_RENDER_VERSION,
    ...(input.adaptiveRecovery ? { adaptiveRecovery: input.adaptiveRecovery.sha256 } : {}),
    ...(input.selfRepair ? { selfRepair: input.selfRepair } : {}),
    ...(input.authoredDiagnosis ? { authoredDiagnosis: input.authoredDiagnosis } : {}),
    ...(input.nativeMaskTail ? { nativeMaskTail: input.nativeMaskTail } : {}),
    ...(placementGuidePng ? { guidedFrameRecovery: input.guidedFrameRecovery, placementGuideSha256:sha(placementGuidePng) } : {}),
    ...(plan ? { subject: plan.sha256 } : {}),
  });
  // A started purchase keeps its exact v1 subject or pre-enrollment fingerprint.
  // Only a genuinely new key gets v2. Foreign fingerprints still stop at purchaseOnce.
  let subject: SubjectRenderDirection | undefined = input.subjectDirection;
  if (subject) {
    const started = await deps.ledger.readRequest(worldId, renderKey);
    if (started) subject = directions.find(direction => started.operationFingerprint === fingerprintFor(promptWith(direction), direction));
  }
  const prompt = promptWith(subject);
  const renderFingerprint = fingerprintFor(prompt, subject);

  // The window goes INTO the purchase, not around it: a replay costs no time and
  // needs no check, and a dispatch is refused by the thing that reserves for it.
  const windowFor = (minimumMs: number) => input.deadlineAt === undefined ? undefined : {
    deadlineAt: input.deadlineAt, needMs: minimumMs + LOCAL_PATCH_PHASE_MARGIN_MS, retainMs: LOCAL_PATCH_PHASE_MARGIN_MS,
  };

  const bought = await purchaseOnce(deps, {
    ...(windowFor(LOCAL_PATCH_MIN_PROVIDER_MS.render) ? { dispatchWindow: windowFor(LOCAL_PATCH_MIN_PROVIDER_MS.render)! } : {}),
    worldId, requestKey: renderKey, scope: "image",
    operationFingerprint: renderFingerprint, reserveMicroUsd: LOCAL_PATCH_RESERVE.renderMicroUsd,
    buy: async ({ timeoutMs }) => {
      const result = await deps.render({ worldId, requestKey: renderKey, prompt, stylePng, identityPng: renderIdentityPng, maskPng,
        ...(placementGuidePng ? { placementGuidePng, placementGuideVersion:GUIDED_FRAME_RECOVERY_VERSION } : {}),
        ...(input.boardPeoplePng ? { boardPeoplePng: input.boardPeoplePng } : {}),
        ...(input.canonicalIdentityPng ? { canonicalIdentityPng: input.canonicalIdentityPng } : {}),
        ...(subject ? { referenceMode: LOCAL_PATCH_PHOTO_REFERENCE_MODE, subjectPhotoPng: subject.photoPng, subjectQuality: subject.quality }
          : input.referenceMode ? { referenceMode: input.referenceMode } : {}),
        ...(timeoutMs === null ? {} : { timeoutMs }) });
      const kept = result.png ?? result.quarantined;
      const keep: RetainedRender = {
        version: RETAINED_RENDER_VERSION,
        bytesBase64: kept ? kept.toString("base64") : null,
        rejected: result.rejected,
        ...(result.failureReceipt ? { failureReceipt: fixedSourceFailureReceiptSchema.parse(result.failureReceipt) } : {}),
        ...(authoredReturn?.sourcePlacement ? { authoredReturn, ...(input.authoredDiagnosis ? { authoredDiagnosis: input.authoredDiagnosis } : {}) } : {}),
      };
      const bytes = Buffer.from(JSON.stringify(keep));
      // A rejected picture is still a charge. Settling the bill the provider
      // priced is not approval of the image; refusing to settle it because the
      // image was refused is how a known amount became an unknown one.
      return result.evidence
        ? { bytes, evidence: result.evidence }
        : { bytes, unknownReason: result.unknownReason ?? "the provider answered and its charge was never stated" };
    },
  });
  if (bought.kind === "deferred") return bought.reserved ? heldForOperator(bought.reason) : deferred(bought.reason);
  if (bought.kind !== "bought") return stopped(bought.reason);

  const renderCents = bought.evidence.amountMicroUsd / 10_000;
  // Re-read from the retained envelope, never from what this process happens to
  // remember: a replay has to reach the same conclusion about the same bytes.
  let painted: RetainedRender;
  try { painted = JSON.parse(bought.bytes.toString()) as RetainedRender; }
  catch { return refusedRender(`${renderKey}: the retained render cannot be read`, renderCents); }
  if (painted.rejected !== null || !painted.bytesBase64) {
    return refusedRender(painted.rejected ?? `${renderKey}: nothing usable was retained`, renderCents);
  }
  const patchPng = await sharp(Buffer.from(painted.bytesBase64, "base64")).resize(LOCAL_PATCH_CROP.width, LOCAL_PATCH_CROP.height, { fit: "fill" }).png().toBuffer();
  // The outline is restored before the join, so the seam report describes the published pixels.
  const occluded = foreground ? await occludeLocalPatch(patchPng,
    await sharp(input.composedPng, { limitInputPixels: 8_294_400 }).extract(crop).png().toBuffer(), foreground) : null;
  const restored = (shipping: Buffer) => occluded ? { foreground: foregroundRecord(foreground!, occluded.restoredPixels, sha(shipping)) } : {};
  const bounded = isLocalPatchStrictVersion(input.contentVersion)
    ? await composeBoundedLocalPatch(input.composedPng, crop, occluded?.png ?? patchPng, mask, {
      requireAligned: hasLocalPatchCapability(input.contentVersion, "integratedQuality") && !playerReviewEnabled(),
      playerReview: hasLocalPatchCapability(input.contentVersion, "integratedQuality") && playerReviewEnabled(),
      ...(hide.returnRect ? { returnRect: hide.returnRect } : {}),
    }) : null;
  const seam = bounded?.report ?? await analysePatchSeam(input.composedPng, crop, patchPng, { allowedRect: { left: 0, top: 0, ...LOCAL_PATCH_CROP } });
  const fade = seam.verdict === "clean" || seam.verdict === "fade-recommended";
  const candidate = bounded?.candidate ?? await applyLocalPatch(input.composedPng, crop, patchPng, { fade, report: seam });
  if (bounded && !bounded.usable) {
    // Retain a viewable refusal, but never turn a diagnosed broken join into a
    // hard-pasted shipping image. This is a concluded, billed attempt, not a hold.
    const shipping = await sharp(candidate).extract(crop).png().toBuffer();
    return { ...refusedRender(`quality-seam: ${seam.reason}`, renderCents),
      patchPng, shippingPng: shipping, judgedSha256: sha(shipping), seam, compositionPermission: bounded.compositionPermission,
      compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION, replayed: bought.replayed, ...restored(shipping) };
  }

  if (isLocalPatchAdvisoryVersion(input.contentVersion)) {
    // All five current pictures are reviewed together by the board worker.
    // This is render completion, NOT a invented passing judgement or permission
    // to publish: that worker later binds the final findings and policy record.
    const shipping = await sharp(candidate, { limitInputPixels: 8_294_400 }).extract(crop).png().toBuffer();
    return { accepted: true, refusedBecause: null, stoppedReason: null, renderFault: null, needsOperator: false,
      patchPng, shippingPng: shipping, composedPng: candidate, seam, verdict: null, wireFault: null,
      ...(bounded ? { compositionPermission: bounded.compositionPermission, compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION } : {}),
      promptVersion, judgedSha256: sha(shipping), renderCents, judgeCents: 0, costUnknown: false, replayed: bought.replayed, ...restored(shipping) };
  }

  const size = { width: meta.width ?? 0, height: meta.height ?? 0 };
  const beforePng = await viewAround(input.composedPng, crop, size);
  const afterPng = await viewAround(candidate, crop, size);
  const expectation = { support: LOCAL_PATCH_POSE_WORDING[hide.pose].support, ageYears: input.ageYears };

  const judgeKey = `${hide.id}:${hide.pose}:judge:${attempt}`;
  // The QUESTION is part of what was bought, not just the pictures. Fingerprinting
  // the images and the model alone meant that changing the judge's instructions
  // could replay an answer purchased under the old ones. Re-deriving a verdict
  // from a retained reply after correcting the PARSER stays free, deliberately -
  // that is a different thing from changing what the model was asked to look at.
  const judgeSettings = localPatchJudgeSettings(input.contentVersion);
  const judgeFingerprint = fingerprintOf({
    model: judgeSettings.model, effort: judgeSettings.effort, maxOutputTokens: judgeSettings.maxOutputTokens,
    hide: hide.id, prompt: sha(Buffer.from(localPatchJudgePrompt(hide.id, expectation, input.contentVersion))),
    before: sha(beforePng), after: sha(afterPng), identity: sha(input.judgeIdentityPng),
  });

  const ask = deps.judge ?? ((request: LocalPatchJudgeRequest) => judgeLocalPatch(input.apiKey, request));
  const judged = await purchaseOnce(deps, {
    worldId, requestKey: judgeKey, scope: "judge",
    operationFingerprint: judgeFingerprint, reserveMicroUsd: LOCAL_PATCH_RESERVE.judgeMicroUsd,
    ...(windowFor(LOCAL_PATCH_MIN_PROVIDER_MS.judge) ? { dispatchWindow: windowFor(LOCAL_PATCH_MIN_PROVIDER_MS.judge)! } : {}),
    buy: async ({ timeoutMs }) => {
      const answer = await ask({ hideId: hide.id, beforePng, afterPng, identityPng: input.judgeIdentityPng, expectation,
        ...(input.contentVersion === undefined ? {} : { contentVersion: input.contentVersion }),
        ...(timeoutMs === null ? {} : { timeoutMs }) });
      const keep: RetainedJudgement = {
        raw: answer.raw, usage: answer.usage, requestId: answer.requestId,
        model: answer.model, finishReason: answer.finishReason, wireFault: answer.wireFault,
      };
      const bytes = Buffer.from(JSON.stringify(keep));
      const charge = judgeCharge(answer.model ?? "", answer.usage ?? undefined);
      // A charge nobody can state is not a charge of zero. No usage, a model
      // with no rate, or a reply we could not trust: the answer is kept and the
      // amount stays unknown rather than being settled as free.
      if (charge.costUnknown || answer.costUnknown || !answer.requestId) {
        const why = !answer.requestId ? "the reply carried no receipt"
          : charge.costUnknown ? `no rate for ${answer.model ?? "an unnamed model"} or no usage to price` : "the provider did not describe the charge";
        return { bytes, unknownReason: why };
      }
      return {
        bytes,
        evidence: {
          providerNamespace: "openai:find-me-existing",
          providerRequestId: answer.requestId,
          usageId: sha(Buffer.from(JSON.stringify(answer.usage ?? {}))),
          rawUsage: (answer.usage ?? {}) as BudgetJson,
          model: answer.model ?? LOCAL_PATCH_JUDGE.model,
          amountMicroUsd: Math.round(charge.costCents * 10_000),
          // Computed from a rate card, not read off an invoice. Saying otherwise
          // would present our own arithmetic as the provider's bill.
          costBasis: "conservative-upper-estimate",
        },
      };
    },
  });
  if (judged.kind === "deferred") return judged.reserved ? heldForOperator(judged.reason, renderCents) : deferred(judged.reason, renderCents);
  if (judged.kind !== "bought") return stopped(judged.reason, renderCents);

  // Re-derived from the retained reply, never read back from a stored verdict.
  const keep = JSON.parse(judged.bytes.toString()) as RetainedJudgement;
  let verdict: LocalPatchVerdict | null = null;
  if (keep.wireFault === null && typeof keep.raw === "string") {
    try {
      verdict = parseLocalPatchVerdict(JSON.parse(keep.raw), input.contentVersion);
    } catch { verdict = null; }
  }

  // Settled, decodable imagery publishes under the new policy even if review
  // disagrees or could not be parsed. The original findings remain untouched.
  const accepted = isLocalPatchAdvisoryVersion(input.contentVersion ?? 0)
    || (keep.wireFault === null && verdict?.verdict === "pass");
  // Taken from the candidate whether or not it is accepted: a refusal is bound
  // to its picture too, or nobody can tell later which render was refused.
  const shipping = await sharp(candidate, { limitInputPixels: 8_294_400 }).extract(crop).png().toBuffer();

  return {
    accepted,
    refusedBecause: accepted ? null : keep.wireFault !== null ? "wire" : "judge",
    stoppedReason: null,
    renderFault: null,
    needsOperator: false,
    patchPng,
    shippingPng: shipping,
    composedPng: accepted ? candidate : null,
    seam,
    verdict,
    wireFault: keep.wireFault,
    promptVersion: LOCAL_PATCH_PROMPT_VERSION,
    judgedSha256: sha(shipping),
    renderCents,
    judgeCents: judged.evidence.amountMicroUsd / 10_000,
    // Both purchases settled, so both amounts are stated. An unpriceable one
    // never reaches here: it comes back `stopped` with the answer retained.
    costUnknown: false,
    replayed: bought.replayed && judged.replayed,
  };
}
