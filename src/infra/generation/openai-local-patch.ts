import { createHash } from "node:crypto";
import sharp from "sharp";
import { isLocalPatchAdvisoryVersion } from "../../domain/scene/local-patch-catalog";
import {
  BudgetedOpenAiFixedSourceProvider, FixedSourceError, prepareFixedSource,
  type FixedSourceLedger, type FixedSourcePolicy,
} from "./openai-fixed-source";
import { auditWorldBudget, type WorldBudgetAudit, type WorldChargeEvidence } from "../../services/generation/world-budget";

/**
 * Buying one local patch: the painter this engine has been missing.
 *
 * Everything above this - the purchase boundary, the real ledger, the retained
 * store, the hide runner, the queue - has been built and proved against a
 * synthetic painter. Nothing could actually buy a patch, and `localPatchPainter`
 * is what closes that.
 *
 * IT DOES NOT REIMPLEMENT THE TRANSPORT. `BudgetedOpenAiFixedSourceProvider`
 * already sends this exact request and already carries the checks that were
 * learned the expensive way: the payload bound tied to what the store will
 * accept, the raster validation that knows an opaque local patch legitimately
 * has no alpha, the model check, the usage schema, the rate card. A second copy
 * of that would drift from it, and the drift would be discovered by being
 * billed for something nobody could save.
 *
 * What it DOES own is the accounting boundary. The provider was written to
 * reserve and settle against the world budget itself; this route reserves and
 * settles exactly once through `purchaseOnce`, which retains the bytes with the
 * bill before the ledger is touched. So the provider is handed a RECORDER
 * rather than a ledger - it is not a permissive fake standing in for one, it is
 * how the provider's billing decision is carried back out to the boundary that
 * owns it. The real world budget sees this purchase exactly once, from there.
 *
 * The settings are the ones a paid round actually produced good patches with
 * (work/local-patch-experiment-20260910, 10 September): medium quality, an
 * opaque 768x1152 - the smallest legal request at the crop's own 2:3 - reduced
 * by exactly two thirds on the way back.
 */

/** How long one paint may take. Published so a caller can budget a slice around it. */
export const LOCAL_PATCH_IMAGE_TIMEOUT_MS = 240_000;
export const LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE = "canonical-portrait-only/v1" as const;
export type LocalPatchReferenceMode = typeof LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE;

export const LOCAL_PATCH_IMAGE_POLICY: FixedSourcePolicy = Object.freeze({
  quality: "medium",
  size: "768x1152",
  background: "opaque",
  // Only `purchaseOnce` reserves on this route; the provider's own reservation
  // goes to the recorder. The figure is kept truthful anyway, because it is
  // what an operator reading a diagnostic receipt would expect to see.
  reserveMicroUsd: 150_000,
  providerNamespace: "openai:find-me-existing",
  timeoutMs: LOCAL_PATCH_IMAGE_TIMEOUT_MS,
  rateCard: { id: "existing-reviewed-image2-5-8-30-microusd-v1", textInput: 5, imageInput: 8, imageOutput: 30 },
});

/** The public v7 pilot's LOW comparison was explicitly accepted by the owner.
 * Keep the original object and hash for v6 and historical callers: quality is
 * part of a paid request's identity, not a global setting to rewrite on replay.
 * Initial character creation uses its separate MEDIUM contract, unchanged. */
const FIVE_HIDE_IMAGE_POLICY: FixedSourcePolicy = Object.freeze({ ...LOCAL_PATCH_IMAGE_POLICY, quality: "low" });
export const localPatchImagePolicyForVersion = (contentVersion?: number): FixedSourcePolicy =>
  isLocalPatchAdvisoryVersion(contentVersion) ? FIVE_HIDE_IMAGE_POLICY : LOCAL_PATCH_IMAGE_POLICY;

/**
 * What the render fingerprint pins, beside the prompt and the pictures: change
 * the model, the quality, the size or the rate card and it is a different
 * purchase that must never replay the previous one.
 */
export const localPatchRenderPolicySha256 = (policy: FixedSourcePolicy = LOCAL_PATCH_IMAGE_POLICY) =>
  createHash("sha256").update(JSON.stringify({
    version: "local-patch-painter/v1", quality: policy.quality, size: policy.size,
    background: policy.background, rateCard: policy.rateCard, timeoutMs: policy.timeoutMs,
  })).digest("hex");

export type LocalPatchRenderInput = {
  readonly worldId: string;
  readonly requestKey: string;
  readonly prompt: string;
  readonly stylePng: Buffer;
  readonly identityPng: Buffer;
  /** Explicit v9 recipe: the scene and approved portrait are the only two images. */
  readonly referenceMode?: LocalPatchReferenceMode;
  /** v8 only: full approved sheet corroborates the high-resolution portrait. */
  readonly canonicalIdentityPng?: Buffer;
  readonly boardPeoplePng?: Buffer;
  readonly maskPng: Buffer;
  /**
   * What is left of the caller's request, when it has a deadline.
   *
   * The paint gets the SMALLER of this and its own allowance, so a call can
   * never outlive the request paying for it - which is what keeps the answer
   * and the writing down of the answer on the same side of the host's timeout.
   */
  readonly timeoutMs?: number;
};

/**
 * A charge that happened, carried back to whoever owns the accounting.
 *
 * Deliberately NOT a budget. It authorises nothing, caps nothing and holds
 * nothing; it writes down what the provider decided about the bill so the
 * purchase boundary can do all of that, once.
 */
class CapturedCharge implements FixedSourceLedger {
  evidence: WorldChargeEvidence | null = null;
  unknownReason: string | null = null;

  reserve = async () => ({
    acquired: true as const,
    request: { requestKey: "captured", scope: "image" as const, operationFingerprint: "captured", reserveMicroUsd: 0,
      origin: "reserved" as const, state: "pending" as const, unknownReasons: [], conflicts: [] },
    audit: this.audit(),
  });

  settle = async (_worldId: string, _requestKey: string, evidence: WorldChargeEvidence) => {
    this.evidence = evidence;
    // `held: false`, because holding is the real ledger's decision and it makes
    // it a moment later with the full picture. Answering otherwise here would
    // make the provider discard an image this route has already paid for.
    return { request: { requestKey: "captured" } as never, audit: this.audit() };
  };

  markUnknown = async (_worldId: string, _requestKey: string, reason: string) => {
    this.unknownReason = reason;
    return { request: { requestKey: "captured" } as never, audit: this.audit() };
  };

  private audit(): WorldBudgetAudit {
    return auditWorldBudget({ worldId: "captured", requests: [] });
  }
}

/**
 * What one dispatch established, kept apart on purpose.
 *
 * Whether the picture may be used and whether the charge can be stated are two
 * different questions, and collapsing them lost a known bill: an image of the
 * wrong shape was refused, the error was flattened, and a charge the response
 * had priced exactly went into the ledger as unknown. A rejected image is a
 * rejected image; the money still moved and we still know how much.
 */
export type LocalPatchPurchase = {
  /** The picture, when there is a usable one. */
  readonly png: Buffer | null;
  /** Why there is no usable picture. Null when `png` is the picture. */
  readonly rejected: string | null;
  /**
   * Bounded bytes worth keeping even though nothing may draw them: what was
   * refused, so a person can see WHY a spot keeps failing.
   */
  readonly quarantined: Buffer | null;
  readonly evidence: WorldChargeEvidence | null;
  /** Why the bill cannot be stated. Null when `evidence` is the bill. */
  readonly unknownReason: string | null;
};

/**
 * One patch, one HTTP request, ever.
 *
 * Throws when there is no image to hand back - a transport failure, a reply
 * that could not be trusted, an image the checks refused. `purchaseOnce` turns
 * a throw into an unknown charge with the reservation retained, which is the
 * correct reading of "we dispatched and cannot say what came back".
 */
export async function buyLocalPatch(apiKey: string, input: LocalPatchRenderInput, options: {
  readonly policy?: FixedSourcePolicy;
  readonly fetchOnce?: typeof fetch;
} = {}): Promise<LocalPatchPurchase> {
  const chosen = options.policy ?? LOCAL_PATCH_IMAGE_POLICY;
  const policy: FixedSourcePolicy = input.timeoutMs === undefined ? chosen
    : { ...chosen, timeoutMs: Math.max(1_000, Math.min(chosen.timeoutMs, input.timeoutMs)) };
  // The crop goes as the reference at its own size - references are capped at
  // 1024 square and 512x768 is inside that. Only the OUTPUT is asked for larger.
  if (input.referenceMode !== undefined && input.referenceMode !== LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE) {
    throw new Error("LOCAL_PATCH_PAINTER: unsupported reference mode");
  }
  const portraitOnly = input.referenceMode === LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE;
  if (portraitOnly && (input.boardPeoplePng || input.canonicalIdentityPng)) {
    throw new Error("LOCAL_PATCH_PAINTER: portrait-only mode forbids additional face or body references");
  }
  // The new portrait is already prepared and bounded. Preserve its exact bytes
  // (including native resolution) rather than enlarging it or adding strangers.
  // prepareFixedSource still validates it before any provider dispatch.
  const identityPng = portraitOnly ? Buffer.from(input.identityPng)
    : await sharp(input.identityPng).resize(1024, 1024, { fit: "inside", withoutEnlargement: !!input.boardPeoplePng }).png().toBuffer();
  if (input.canonicalIdentityPng && !input.boardPeoplePng) throw new Error("LOCAL_PATCH_PAINTER: canonical references require their explicit board reference");
  const canonical = input.canonicalIdentityPng
    ? await sharp(input.canonicalIdentityPng).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).png().toBuffer() : null;
  const request = {
    sourceGroupKey: `local-patch:${input.requestKey}`,
    prompt: input.prompt, stylePng: input.stylePng, identityPng, maskPng: input.maskPng,
    ...(input.boardPeoplePng ? { referencePngs: [input.boardPeoplePng, ...(canonical ? [canonical] : [])] } : {}),
  };
  const prepared = await prepareFixedSource(request, policy);
  const charge = new CapturedCharge();
  const provider = new BudgetedOpenAiFixedSourceProvider(apiKey, charge, policy, options.fetchOnce);

  let answer;
  try {
    answer = await provider.generate({ ...request, worldId: input.worldId, requestKey: input.requestKey, expectedFingerprint: prepared.fingerprint });
  } catch (error) {
    const why = error instanceof FixedSourceError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : String(error);
    const rejected = `${input.requestKey} was dispatched and no usable image came back (${why})`;
    // What the transport had already established survives the refusal. A bill
    // it computed cleanly is still that bill, and bytes it had already bounded
    // and decoded are still worth keeping - the image is refused either way.
    const established = error instanceof FixedSourceError ? error.established : undefined;
    const evidence = established?.evidence ?? charge.evidence;
    // A PICTURE THAT PASSED EVERY CHECK IS A PICTURE, whatever happened to its
    // bill. The transport only offers one here when the failure was about the
    // money - a refusal of the image itself offers the bytes as evidence and
    // nothing more - so this cannot quietly promote something that was refused.
    if (established?.png !== undefined) {
      return {
        png: established.png, rejected: null, quarantined: null,
        evidence: evidence ?? null,
        unknownReason: evidence ? null : charge.unknownReason ?? `the picture arrived and its charge cannot be stated (${why})`,
      };
    }
    if (!evidence && !established?.rejectedPng) {
      // Nothing priced and nothing kept: there is no purchase to describe, only
      // a dispatch that may have been billed. The boundary reads a throw as
      // exactly that and holds the reservation for a person.
      throw new Error(`LOCAL_PATCH_PAINTER: ${rejected}`);
    }
    return {
      png: null, rejected, quarantined: established?.rejectedPng ?? null,
      evidence: evidence ?? null,
      unknownReason: evidence ? null : charge.unknownReason ?? "the provider answered and its charge was never stated",
    };
  }
  if (answer.kind !== "generated") {
    throw new Error(`LOCAL_PATCH_PAINTER: ${input.requestKey} was already recorded by the transport (${answer.requestState}); reconcile rather than re-buying`);
  }
  // Handed back at the size it came, not the size it will be used at: these are
  // the bytes that were paid for, and they are what gets retained. Fitting them
  // to the crop is the renderer's business and it already does it.
  return {
    png: answer.png, rejected: null, quarantined: null,
    evidence: charge.evidence,
    unknownReason: charge.evidence ? null : charge.unknownReason ?? "the provider answered and its charge was never stated",
  };
}
