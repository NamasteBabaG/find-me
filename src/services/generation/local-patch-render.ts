import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  LOCAL_PATCH_CROP, type LocalPatchBoard, type LocalPatchHide, cropOf, maskForHide,
} from "../../domain/scene/local-patch-hides";
import { analysePatchSeam, applyLocalPatch, composeBoundedLocalPatch, LOCAL_PATCH_COMPOSITION_VERSION, type LocalPatchCompositionPermission, type SeamReport } from "./local-patch-seam";
import {
  LOCAL_PATCH_JUDGE, localPatchJudgeSettings, judgeLocalPatch, localPatchJudgePrompt, localPatchVerdictSchema,
  type JudgeWireFault, type LocalPatchJudgeRequest, type LocalPatchJudgeResult, type LocalPatchVerdict,
} from "./local-patch-judge";
import { judgeCharge } from "../../infra/generation/judge";
import { LOCAL_PATCH_POSE_WORDING, LOCAL_PATCH_PROMPT_VERSION, LOCAL_PATCH_BOARD_DRAWN_PROMPT_VERSION, LOCAL_PATCH_FIVE_PROMPT_VERSION, LOCAL_PATCH_CANONICAL_PROMPT_VERSION, LOCAL_PATCH_AGE_PROMPT_VERSION, localPatchPrompt, type LocalPatchRepairCheck } from "./local-patch-prompt";
import { purchaseOnce, type PurchaseLedger, type RetainedPurchaseStore } from "./paid-operation";
import { LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE, type LocalPatchPurchase, type LocalPatchReferenceMode } from "../../infra/generation/openai-local-patch";
import type { BudgetJson, WorldChargeEvidence } from "./world-budget";
import { isLocalPatchAdvisoryVersion, isLocalPatchAgeVersion, isLocalPatchStrictVersion } from "../../domain/scene/local-patch-catalog";

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
    readonly referenceMode?: LocalPatchReferenceMode;
    readonly canonicalIdentityPng?: Buffer;
    readonly boardPeoplePng?: Buffer;
    /** What is left of the caller's request. An adapter that ignores it can outlive it. */
    readonly timeoutMs?: number;
  }) => Promise<LocalPatchPurchase>;
  /** Overridable so a test can answer without a network. */
  readonly judge?: (request: LocalPatchJudgeRequest) => Promise<LocalPatchJudgeResult>;
};

export type LocalPatchAttemptInput = {
  readonly contentVersion?: number;
  readonly worldId: string;
  readonly board: LocalPatchBoard;
  readonly hide: LocalPatchHide;
  /** The board as it now stands, with any earlier hides already painted in. */
  readonly composedPng: Buffer;
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
  readonly compositionVersion?: typeof LOCAL_PATCH_COMPOSITION_VERSION;
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
  readonly version: typeof RETAINED_RENDER_VERSION;
  /** Base64 of what came back, whether it may be drawn or not. */
  readonly bytesBase64: string | null;
  /** Null when the bytes are a usable patch; why not, otherwise. */
  readonly rejected: string | null;
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
  const result = await renderLocalPatchHideInner(deps, input);
  return { ...result, promptVersion: promptVersionOf(input),
    ...(isLocalPatchStrictVersion(input.contentVersion) ? { compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION } : {}) };
}

function promptVersionOf(input: LocalPatchAttemptInput): string {
  if (isLocalPatchAgeVersion(input.contentVersion)) return LOCAL_PATCH_AGE_PROMPT_VERSION;
  return isLocalPatchStrictVersion(input.contentVersion) ? LOCAL_PATCH_CANONICAL_PROMPT_VERSION
    : isLocalPatchAdvisoryVersion(input.contentVersion) ? LOCAL_PATCH_FIVE_PROMPT_VERSION
    : input.boardPeoplePng ? LOCAL_PATCH_BOARD_DRAWN_PROMPT_VERSION : LOCAL_PATCH_PROMPT_VERSION;
}

async function renderLocalPatchHideInner(deps: LocalPatchRenderDeps, input: LocalPatchAttemptInput): Promise<LocalPatchAttempt> {
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
  const prompt = localPatchPrompt({ ground: board.ground, pose: hide.pose, ageYears: input.ageYears, repairChecks: input.repairChecks, boardPeopleReference: !!input.boardPeoplePng,
    wardrobe: board.wardrobe, placement: hide.placement, mask: maskForHide(hide), contentVersion: input.contentVersion });

  const meta = await sharp(input.composedPng, { limitInputPixels: 8_294_400 }).metadata();
  const stylePng = await sharp(input.composedPng, { limitInputPixels: 8_294_400 }).extract(crop).png().toBuffer();
  const maskPng = await poseMask(hide);

  const renderKey = `${hide.id}:${hide.pose}:render:${attempt}`;
  // Everything that decides what is being bought. A different photograph,
  // prompt, mask or crop is a different purchase and must never replay this one.
  const renderFingerprint = fingerprintOf({
    version: promptVersion, hide: hide.id, pose: hide.pose, crop,
    prompt: sha(Buffer.from(prompt)), style: sha(stylePng), identity: sha(input.identityPng), mask: sha(maskPng),
    ...(input.boardPeoplePng ? { boardPeople: sha(input.boardPeoplePng) } : {}),
    ...(input.canonicalIdentityPng ? { canonicalIdentity: sha(input.canonicalIdentityPng) } : {}),
    ...(input.referenceMode ? { referenceMode: input.referenceMode } : {}),
    ...(isLocalPatchStrictVersion(input.contentVersion) ? { composition: "bounded-return/v1" } : {}),
    policy: deps.renderPolicySha256,
    // The SHAPE of what is kept, not only what was bought. A record written
    // before this envelope existed would otherwise be read under this same
    // fingerprint and come out "cannot be read" - a good paid picture called a
    // bad one. A different shape is a different operation, which is a thing for
    // a person rather than a verdict.
    retained: RETAINED_RENDER_VERSION,
  });

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
      const result = await deps.render({ worldId, requestKey: renderKey, prompt, stylePng, identityPng: input.identityPng, maskPng,
        ...(input.boardPeoplePng ? { boardPeoplePng: input.boardPeoplePng } : {}),
        ...(input.canonicalIdentityPng ? { canonicalIdentityPng: input.canonicalIdentityPng } : {}),
        ...(input.referenceMode ? { referenceMode: input.referenceMode } : {}),
        ...(timeoutMs === null ? {} : { timeoutMs }) });
      const kept = result.png ?? result.quarantined;
      const keep: RetainedRender = {
        version: RETAINED_RENDER_VERSION,
        bytesBase64: kept ? kept.toString("base64") : null,
        rejected: result.rejected,
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
  const bounded = isLocalPatchStrictVersion(input.contentVersion)
    ? await composeBoundedLocalPatch(input.composedPng, crop, patchPng, maskForHide(hide)) : null;
  const seam = bounded?.report ?? await analysePatchSeam(input.composedPng, crop, patchPng, { allowedRect: { left: 0, top: 0, ...LOCAL_PATCH_CROP } });
  const fade = seam.verdict === "clean" || seam.verdict === "fade-recommended";
  const candidate = bounded?.candidate ?? await applyLocalPatch(input.composedPng, crop, patchPng, { fade, report: seam });
  if (bounded && !bounded.usable) {
    // Retain a viewable refusal, but never turn a diagnosed broken join into a
    // hard-pasted shipping image. This is a concluded, billed attempt, not a hold.
    const shipping = await sharp(candidate).extract(crop).png().toBuffer();
    return { ...refusedRender(`quality-seam: ${seam.reason}`, renderCents),
      patchPng, shippingPng: shipping, judgedSha256: sha(shipping), seam, compositionPermission: bounded.compositionPermission,
      compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION, replayed: bought.replayed };
  }

  if (isLocalPatchAdvisoryVersion(input.contentVersion)) {
    // All five current pictures are reviewed together by the board worker.
    // This is render completion, NOT a invented passing judgement or permission
    // to publish: that worker later binds the final findings and policy record.
    const shipping = await sharp(candidate, { limitInputPixels: 8_294_400 }).extract(crop).png().toBuffer();
    return { accepted: true, refusedBecause: null, stoppedReason: null, renderFault: null, needsOperator: false,
      patchPng, shippingPng: shipping, composedPng: candidate, seam, verdict: null, wireFault: null,
      ...(bounded ? { compositionPermission: bounded.compositionPermission, compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION } : {}),
      promptVersion, judgedSha256: sha(shipping), renderCents, judgeCents: 0, costUnknown: false, replayed: bought.replayed };
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
      const parsed = localPatchVerdictSchema.safeParse(JSON.parse(keep.raw));
      verdict = parsed.success ? parsed.data : null;
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
