import sharp from "sharp";
import {
  LOCAL_PATCH_CROP, type LocalPatchBoard, type LocalPatchHide, cropOf, maskInCrop,
} from "../../domain/scene/local-patch-hides";
import { analysePatchSeam, applyLocalPatch, type SeamReport } from "./local-patch-seam";
import { judgeLocalPatch, type LocalPatchJudgeRequest, type LocalPatchJudgeResult } from "./local-patch-judge";
import { judgeCharge } from "../../infra/generation/judge";
import { LOCAL_PATCH_POSE_WORDING, LOCAL_PATCH_PROMPT_VERSION, localPatchPrompt } from "./local-patch-prompt";

/**
 * One paid attempt at one hide, out of the scripts and into the product.
 *
 * This is the step the scripts under `work/` were doing by hand: cut the crop,
 * build the mask the pose needs, buy one render, check the seam, composite only
 * the declared rectangle, and judge the result once. It lives here so the
 * pipeline and the authoring scripts run the same code rather than two copies
 * that drift - the copies had already drifted, and one of them was still reading
 * judge fields the schema had dropped.
 *
 * Two rules are structural rather than advisory:
 *
 *  - **Every charge goes through one `spend`.** The scripts put the render
 *    inside a budget and left the judgement outside it, so a ledger said 29.60c
 *    while the round had actually cost 38.85c. A judgement is a purchase.
 *  - **The bytes are retained before they are judged.** The ledger has always
 *    had somewhere to put them; the callers never handed them over, so four
 *    refused renders could not be looked at afterwards and the question "was the
 *    judge right?" had no evidence to answer it with.
 */

export type LocalPatchRenderReceipt = {
  readonly costCents: number;
  /** True when the call may have been billed and the amount cannot be stated. */
  readonly costUnknown: boolean;
  readonly providerRequestId: string | null;
};

export type LocalPatchProviderResult = LocalPatchRenderReceipt & { readonly png: Buffer };

export type LocalPatchRenderDeps = {
  /** Buys one render. Anything about policy, retries and fingerprints is the caller's. */
  readonly render: (input: {
    readonly requestKey: string; readonly prompt: string;
    readonly stylePng: Buffer; readonly identityPng: Buffer; readonly maskPng: Buffer;
  }) => Promise<LocalPatchProviderResult>;
  /**
   * Every purchase, render and judgement alike, passes through here with a
   * reservation. Returning a `costUnknown` result must hold the reservation.
   */
  readonly spend: <T extends { costCents: number; costUnknown?: boolean }>(
    kind: string, reserveCents: number, run: () => Promise<T>) => Promise<T>;
  /** Keeps bytes that were paid for. Called before anything judges them. */
  readonly retain: (name: string, bytes: Buffer) => Promise<void>;
  /** Overridable so a test can answer without a network. */
  readonly judge?: (request: LocalPatchJudgeRequest) => Promise<LocalPatchJudgeResult>;
};

export type LocalPatchAttemptInput = {
  readonly board: LocalPatchBoard;
  readonly hide: LocalPatchHide;
  /** The board as it now stands, with any earlier hides already painted in. */
  readonly composedPng: Buffer;
  readonly identityPng: Buffer;
  /** For the judge, which needs a smaller copy than the painter does. */
  readonly judgeIdentityPng: Buffer;
  /** Stated by the parent. Never guessed; left out when unknown. */
  readonly ageYears?: number | null;
  /** 1 or 2. Part of the request key, so a retry is a new purchase. */
  readonly attempt: number;
  readonly apiKey: string;
};

export type LocalPatchAttempt = {
  readonly accepted: boolean;
  /** Why not, when not: a broken picture and an untrustworthy reply are different. */
  readonly refusedBecause: "judge" | "wire" | null;
  readonly patchPng: Buffer | null;
  /** The whole board with this hide painted in. Only present when accepted. */
  readonly composedPng: Buffer | null;
  readonly seam: SeamReport | null;
  readonly judgement: LocalPatchJudgeResult | null;
  readonly promptVersion: string;
  readonly renderCents: number;
  readonly judgeCents: number;
  readonly costUnknown: boolean;
};

/** How much to hold while a render or a judgement is in flight, in cents. */
export const LOCAL_PATCH_RESERVE = Object.freeze({ render: 12, judge: 4 });

/**
 * The mask handed to the painter: opaque everywhere but the pose's own box,
 * which is transparent, because transparent is the part the edits route may
 * paint.
 *
 * The shape punching the hole has to be OPAQUE. `dest-out` keeps the
 * destination where the source is transparent and removes it where the source
 * is opaque, so a transparent stamp removes nothing - and every mask sent for
 * this world was built with a transparent stamp, which made it 512x768 of solid
 * alpha with **no editable region at all**. The renders that came back were the
 * model following the prose, with the mask contributing nothing. That is also
 * why "an edit mask did not stop it straying" was recorded as a finding: there
 * was no mask.
 */
export async function poseMask(hide: LocalPatchHide): Promise<Buffer> {
  const box = maskInCrop(hide.pose);
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

export async function renderLocalPatchHide(deps: LocalPatchRenderDeps, input: LocalPatchAttemptInput): Promise<LocalPatchAttempt> {
  const { board, hide, attempt } = input;
  const crop = cropOf(hide);
  const requestKey = `${hide.id}:${hide.pose}:${attempt}`;
  const prompt = localPatchPrompt({ ground: board.ground, pose: hide.pose, ageYears: input.ageYears });

  const meta = await sharp(input.composedPng, { limitInputPixels: 8_294_400 }).metadata();
  const stylePng = await sharp(input.composedPng, { limitInputPixels: 8_294_400 }).extract(crop).png().toBuffer();
  const maskPng = await poseMask(hide);

  const bought = await deps.spend(`render:${requestKey}`, LOCAL_PATCH_RESERVE.render, async () =>
    deps.render({ requestKey, prompt, stylePng, identityPng: input.identityPng, maskPng }));
  // Before anything looks at it. A refusal nobody can see is a refusal nobody
  // can argue with, and the argument is the only way the judge gets calibrated.
  await deps.retain(`${requestKey}-render.png`, bought.png);

  const patchPng = await sharp(bought.png).resize(LOCAL_PATCH_CROP.width, LOCAL_PATCH_CROP.height, { fit: "fill" }).png().toBuffer();
  const seam = await analysePatchSeam(input.composedPng, crop, patchPng, { allowedRect: { left: 0, top: 0, ...LOCAL_PATCH_CROP } });
  const fade = seam.verdict === "clean" || seam.verdict === "fade-recommended";
  const candidate = await applyLocalPatch(input.composedPng, crop, patchPng, { fade, report: seam });

  const size = { width: meta.width ?? 0, height: meta.height ?? 0 };
  const beforePng = await viewAround(input.composedPng, crop, size);
  const afterPng = await viewAround(candidate, crop, size);
  await deps.retain(`${requestKey}-after.png`, afterPng);

  const ask = deps.judge ?? ((request: LocalPatchJudgeRequest) => judgeLocalPatch(input.apiKey, request));
  const judgement = await deps.spend(`judge:${requestKey}`, LOCAL_PATCH_RESERVE.judge, async () => {
    const answer = await ask({
      hideId: hide.id, beforePng, afterPng, identityPng: input.judgeIdentityPng,
      expectation: { support: LOCAL_PATCH_POSE_WORDING[hide.pose].support, ageYears: input.ageYears },
    });
    // The judgement's own price rides in the same ledger entry as the judgement.
    // The scripts left this outside the budget, so a ledger read 29.60c for a
    // round that had actually cost 38.85c. A judgement is a purchase.
    //
    // Priced by the model the provider says it RAN, never by the one we asked
    // for. Token counts alone do not make a price known: they have to be
    // multiplied by a rate, and a rate belongs to a model. Pricing a reply from
    // an unexpected model at our own model's rate is a made-up number wearing
    // the shape of a real one, so an unrecognised model prices as unknown.
    const charge = judgeCharge(answer.model ?? "", answer.usage ?? undefined);
    return { ...answer, costCents: charge.costCents, costUnknown: answer.costUnknown || charge.costUnknown };
  });

  const accepted = judgement.wireFault === null && judgement.verdict?.verdict === "pass";
  return {
    accepted,
    refusedBecause: accepted ? null : judgement.wireFault !== null ? "wire" : "judge",
    patchPng,
    composedPng: accepted ? candidate : null,
    seam,
    judgement,
    promptVersion: LOCAL_PATCH_PROMPT_VERSION,
    renderCents: bought.costCents,
    judgeCents: judgement.costCents,
    costUnknown: bought.costUnknown || judgement.costUnknown,
  };
}
