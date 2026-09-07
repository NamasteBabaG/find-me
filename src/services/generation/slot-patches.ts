import sharp from "sharp";
import { createHash } from "node:crypto";
import { newId } from "@/lib/ids";
import type { SceneDefinition, Target as SceneTarget } from "@/domain/scene/schema";
import { BODY_TEMPLATES } from "../../../content/body-templates";
import type { Container } from "../container";
import { storeAsset } from "../asset.service";
import type { PatchJudgement, SlotPatchResponse } from "@/infra/generation/types";
import { childProblem, matteHint, modelSpaceHeight, paintMask, slotContext, expressionFor, slotPrompt, PROMPT_VERSION } from "./patch";
import { extractChild } from "./extract";
import { readAssetBuffer } from "../asset.service";
import { loadSceneArt } from "./scene-art";
import { boardComposite } from "./board-composite";
import { BOARD_JUDGE_VERSION, BOARD_CHECKS } from "@/infra/generation/board-verdict";
import { MATTE_WIRE_VERSION, SLOT_WIRE_VERSION } from "@/infra/generation/openai";

/**
 * Generating the hiding spots of one world for one child.
 *
 * Each spot is its own unit of work with its own row, cost and status, because
 * a patch belongs to ONE hiding spot: regenerating "the sandcastle at spot B"
 * must not touch spot A, and QA has to be able to reject one of them.
 */

export type Variant = "A" | "B";

export interface PatchOutcome {
  sceneSlug: string;
  targetId: string;
  variant: Variant;
  status: "GENERATED" | "FAILED" | "SKIPPED";
  /** What this hiding spot has cost in total, across every tick. For display. */
  costCents: number;
  /**
   * What THIS call spent. Zero for a spot that was already done or is out of
   * attempts. The two are separate because the pipeline adds cost to a running
   * total every tick: handing back the lifetime figure made a spot that failed
   * repeatedly re-add its whole history each time, and a game's reported cost
   * grew without anyone spending anything.
   */
  newCostCents: number;
  attempts: number;
  durationMs: number;
  model?: string;
  error?: string;
  /** Out of attempts: a later tick must not retry this, a human has to look. */
  capped?: boolean;
  /**
   * The slice ran out of time after a paid pass. What was paid for is kept
   * (the render, or the render and its matte) and the next tick resumes from
   * it without buying it again. Not a failure and not an attempt spent.
   */
  deferred?: boolean;
}

/**
 * How many rolls one hiding spot may ever cost, across all ticks.
 *
 * Retrying is normal, but a slot the model simply cannot paint will fail
 * forever, and nothing stopped it: one spot spent thirteen rolls and a third
 * of a game's budget before this existed. Three is Guy's rule (7 September):
 * a spot that fails three times is hard from the root and is replaced, not
 * insisted on; the fourth to sixth attempts on the amazon canoe cost as much
 * as the first three and landed nowhere. A spot that hits the cap is left
 * FAILED for a human to look at, and the game goes on to the next one.
 */
export const MAX_ATTEMPTS_PER_SPOT = 3;

/**
 * Time a pass needs before it is started. The tick is one request with a hard
 * limit; a pass that cannot finish inside it is deferred with what came
 * before it kept, never started and killed. Painting has the provider's own
 * budget (150 s with retries); a matte answers in 15–60 s; the judges take
 * 15–45 s together and are not cut short.
 */
export const PASS_ONE_MIN_MS = 60_000;
export const PASS_TWO_MIN_MS = 45_000;
// 45s fast + 60s Sol + local encoding/checkpoint allowance.
export const JUDGE_MIN_MS = 115_000;

export function slotOf(target: SceneTarget, variant: Variant) {
  return variant === "A" ? target.slots[0] : target.slots[1];
}

/**
 * Generate (or resume) one hiding spot. Idempotent: a row that is already
 * GENERATED or APPROVED is returned untouched, so re-running the pipeline after
 * a crash costs nothing.
 */
export async function generateSlotPatch(
  c: Container,
  input: {
    targetInstanceId: string;
    scene: SceneDefinition;
    target: SceneTarget;
    variant: Variant;
    /** The child's identity sheet — the same reference for every spot. */
    reference: Buffer;
    childName: string;
    ageYears?: number | null;
    ownerId: string | null;
    tries?: number;
    /** Overrides the provider's quality for this attempt. */
    quality?: string;
    /** The tick's hard limit: no pass starts that cannot finish before it. */
    deadlineAt?: number;
    /** Pass two's quality; the render's quality when unset. */
    matteQuality?: string;
  },
): Promise<PatchOutcome> {
  const { scene, target, variant } = input;
  const slot = slotOf(target, variant);
  const base: PatchOutcome = { sceneSlug: scene.slug, targetId: target.id, variant, status: "SKIPPED", costCents: 0, newCostCents: 0, attempts: 0, durationMs: 0 };
  if (!c.avatars.editSlotCrop) return { ...base, error: `${c.avatars.id} cannot paint slot patches` };

  const existing = await c.db.targetVariantAsset.findUnique({ where: { targetInstanceId_variant: { targetInstanceId: input.targetInstanceId, variant } } });
  if (existing && (existing.status === "GENERATED" || existing.status === "APPROVED")) return { ...base, costCents: existing.costCents, attempts: existing.attempts };
  const savedLedger = readLedger(existing?.usageJson, existing?.costCents ?? 0);
  const hasPending = savedLedger.attempts.some(a => a.outcome.startsWith("pending") && a.evidenceAssetId);
  if (savedLedger.unknownCost) return { ...base, costCents: existing?.costCents ?? 0, capped: true, error: "unknown charge requires reconciliation before another request" };
  if (existing && existing.attempts >= MAX_ATTEMPTS_PER_SPOT && !hasPending) {
    return { ...base, costCents: existing.costCents, attempts: existing.attempts, capped: true, error: `gave up after ${existing.attempts} attempts: ${existing.lastError ?? "no reason recorded"}` };
  }
  const row =
    existing ??
    (await c.db.targetVariantAsset.create({
      data: { id: newId("tva"), targetInstanceId: input.targetInstanceId, variant, slotId: slot.id, provider: c.avatars.id, promptVersion: PROMPT_VERSION },
    }));

  const art = { width: scene.art.width, height: scene.art.height };
  const ctx = slotContext(art, slot);
  const sceneArt = await loadSceneArt(c.appUrl, scene.art.base, scene.art.sha256);
  const crop = await sharp(sceneArt).extract({ left: ctx.rect.x, top: ctx.rect.y, width: ctx.rect.w, height: ctx.rect.h }).png().toBuffer();
  const mask = paintMask(ctx, art, slot);
  const body = BODY_TEMPLATES[target.bodyTemplate];
  const prompt = slotPrompt({
    ageYears: input.ageYears,
    placement: slot.placement,
    mission: target.mission.en.replace("{name}", input.childName),
    bodyLabel: body?.label.en,
    // In the pixels the model sees, not the art's: the provider scales the window.
    childPx: modelSpaceHeight(ctx.childPx, ctx.rect.h, c.avatars.patchOutputPx),
    // The place dresses and lights the child; the sheet only says who they are.
    place: scene.name.en,
    placeNote: scene.tagline.en,
    // The scene's art direction, when it has any; the body template's pose otherwise.
    wardrobe: scene.wardrobe,
    action: target.action,
    expression: target.expression ?? expressionFor(body?.pose),
  }) + repairInstruction(existing?.judgeJson) + (existing?.lastError && /moved the object/.test(existing.lastError) ? " In the previous attempt the object in front of the child was moved or redrawn; this time it stays exactly as it is in the picture, and the child's hands rest on it where it is." : "");
  const label = `${scene.slug}/${target.id}/${variant}`;

  // Default to a single roll: inside a request with a deadline, three rolls of
  // ~55s each is enough to overrun it. A spot that fails is not marked done, so
  // the next tick tries it again — the retries happen across ticks, not inside one.
  const tries = Math.min(input.tries ?? 1, MAX_ATTEMPTS_PER_SPOT - (existing?.attempts ?? 0));
  // Fractions of a cent, because judging costs about a quarter of one and
  // dropping that per spot would hide roughly a quarter of a dollar per game.
  // Rounded once, at the point it is written to a whole-cent column.
  let spent = 0;
  let attempts = 0;
  let elapsed = 0;
  let model: string | undefined;
  let usage: Record<string, number> | undefined;
  let judged: PatchJudgement | null = null;
  let lastError = "";
  // Rejected renders are kept, not dropped. "Painted 40px tall" says a roll was
  // wrong; only the picture says HOW - the model painted an adult, or a second
  // child, or repainted the whole crop. Without them the only way to see a bad
  // spot was to pay for another roll.
  const rejected: string[] = existingRejected(existing?.rejectedAssetIdsJson) ?? [];
  // What this spot has really cost, to the hundredth of a cent, across every
  // tick. costCents is an integer column and used to be rounded on every tick:
  // a 2-cent roll plus a 0.26-cent judgement was written as 2, and over a
  // world's twenty-seven judgements about seven cents vanished. The exact
  // figure lives in the usage json; the column is rounded once, from it.
  const ledger = savedLedger;
  // The ledger's attempts carry over; a resumed attempt is completed in place.
  const attemptLog: LedgerAttempt[] = ledger.attempts.slice();
  // A slice that ran out of time after a paid pass left the attempt pending
  // with what it bought. It is finished here, from that, before anything new
  // is bought: the render is not painted again, and a kept matte is not
  // bought again either.
  const pendingIndex = attemptLog.findIndex((a) => a.outcome.startsWith("pending") && a.evidenceAssetId);
  const resume = pendingIndex >= 0 ? attemptLog[pendingIndex]! : null;
  const remaining = () => (input.deadlineAt === undefined ? Number.POSITIVE_INFINITY : input.deadlineAt - Date.now());
  const checkpoint = () => c.db.targetVariantAsset.update({ where: { id: row.id }, data: {
    usageJson: JSON.stringify(withLedger(usage, ledger, spent, attemptLog, ledger.unknownCost)),
    costCents: Math.round(ledger.exactCents + spent),
  } });
  const deferred = (): PatchOutcome => ({ ...base, status: "SKIPPED", deferred: true, costCents: (existing?.costCents ?? 0) + spent, newCostCents: spent, attempts, durationMs: elapsed, model });

  for (let attempt = 1; attempt <= Math.max(tries, resume ? 1 : 0); attempt++) {
    const resuming = attempt === 1 && resume !== null;
    if (!resuming && remaining() < PASS_ONE_MIN_MS) return deferred();
    if (!resuming) {
      // One roll, one attempt — counted here so every way out of this iteration
      // counts the same. Adding the provider's own retry count and then adding
      // another on the way through the catch charged two attempts for one call,
      // and quietly halved the budget a spot was allowed.
      attempts += 1;
      // Reserve the attempt before spending. A process killed between the render
      // and final checkpoint must not get six fresh attempts on the next tick.
      await c.db.targetVariantAsset.update({ where: { id: row.id }, data: {
        attempts: { increment: 1 }, promptVersion: PROMPT_VERSION,
      } });
    }
    try {
      let edit: SlotPatchResponse;
      let currentAttempt: LedgerAttempt;
      let priorMatte: Buffer | undefined;
      if (resuming && resume) {
        const saved = resume as LedgerAttempt & { cropHash?: string; referenceHash?: string; sceneHash?: string };
        if (saved.cropHash !== hash(crop) || saved.referenceHash !== hash(input.reference) || saved.sceneHash !== hash(Buffer.from(JSON.stringify(scene)))) {
          throw new Error("pending render inputs changed; do not reuse it against another scene/reference");
        }
        // The render that was paid for in an earlier slice, fitted back to the crop.
        const raw = await readAssetBuffer(c, resume.evidenceAssetId!);
        const png = await sharp(raw).resize(ctx.rect.w, ctx.rect.h, { kernel: "lanczos3" }).png().toBuffer();
        edit = { png, rawPng: raw, costCents: 0, model: resume.model ?? "resumed", durationMs: 0, attempts: 0, providerRequestId: resume.requestId ?? undefined };
        currentAttempt = resume;
        currentAttempt.resumedAt = new Date().toISOString();
        if (resume.matteEvidenceAssetId) priorMatte = await readAssetBuffer(c, resume.matteEvidenceAssetId);
        model = model ?? resume.model ?? undefined;
      } else {
        edit = await c.avatars.editSlotCrop({ crop, paintMask: mask, reference: input.reference, prompt, label, quality: input.quality, deadlineAt: input.deadlineAt });
        spent += edit.costCents;
        if (edit.costUnknown) ledger.unknownCost = true;
        judged = null;
        elapsed += edit.durationMs;
        model = edit.model;
        usage = edit.usage ?? usage;
        attemptLog.push({ at: new Date().toISOString(), model: edit.model, rollCents: edit.costCents, judgeCents: 0, durationMs: edit.durationMs, requestId: edit.providerRequestId ?? null, outcome: "pending" });
        currentAttempt = attemptLog[attemptLog.length - 1]!;
        // Keep accepted inputs too. Otherwise a face hole cannot be re-extracted
        // without buying another render. Private; deletion + 14-day retention apply.
        const raw = edit.rawPng ?? edit.png;
        const evidence = await storeAsset(c, {
          ownerId: input.ownerId, type: "PATCH_EVIDENCE", visibility: "PRIVATE",
          buffer: raw, mimeType: "image/png", provider: c.avatars.id,
          providerRequestId: edit.providerRequestId, costCents: 0,
        });
        Object.assign(currentAttempt, { evidenceAssetId: evidence.id, rawHash: hash(raw), fittedHash: hash(edit.png), cropHash: hash(crop), referenceHash: hash(input.reference), sceneHash: hash(Buffer.from(JSON.stringify(scene))), wireVersion: SLOT_WIRE_VERSION, promptSent: edit.promptSent ?? prompt });
        // Link before processing/judging: even an interrupted extraction remains
        // discoverable by privacy deletion, and its known render charge survives.
        await checkpoint();
      }
      // The child is cut out of the render by the provider's own matte when it
      // has one (pass two), and by the colour difference otherwise. Pass two is
      // a paid call: charged, checkpointed and kept like the roll itself — every
      // answer it gave, not only the last.
      const recordMatte = async (matte: import("@/infra/generation/types").SlotMatteResponse) => {
        const ids: string[] = currentAttempt.matteEvidenceAssetIds ?? [];
        const requestIds: Array<string | null> = currentAttempt.matteRequestIds ?? [];
          spent += matte.costCents;
          if (matte.costUnknown) ledger.unknownCost = true;
          elapsed += matte.durationMs ?? 0;
          // Book the known charge even if writing the image subsequently fails.
          currentAttempt.matteCents = (currentAttempt.matteCents ?? 0) + matte.costCents;
          requestIds.push(matte.providerRequestId ?? null);
          currentAttempt.matteRequestIds = requestIds;
          currentAttempt.matteCalls = [...currentAttempt.matteCalls ?? [], { requestId: matte.providerRequestId ?? null, costCents: matte.costCents, usage: matte.usage, problem: matte.problem }];
          await checkpoint();
          const matteEvidence = await storeAsset(c, {
            ownerId: input.ownerId, type: "PATCH_EVIDENCE", visibility: "PRIVATE",
            buffer: matte.rawPng ?? matte.png, mimeType: "image/png", provider: c.avatars.id,
            providerRequestId: matte.providerRequestId, costCents: 0,
          });
          ids.push(matteEvidence.id);
        Object.assign(currentAttempt, {
          matteRequestId: matte.providerRequestId ?? null, matteRequestIds: requestIds,
          matteEvidenceAssetId: ids[ids.length - 1], matteEvidenceAssetIds: ids,
          matteHash: hash(matte.png), matteWireVersion: MATTE_WIRE_VERSION, mattePromptSent: matte.promptSent,
        });
        await checkpoint();
      };
      const extracted = await extractChild({ provider: c.avatars, originalCrop: crop, editedCrop: edit.png, ctx, art, slot, hint: matteHint(slot), label, reference: input.reference, quality: input.matteQuality ?? input.quality, deadlineAt: input.deadlineAt === undefined ? undefined : input.deadlineAt - 5000, minPassTwoMs: PASS_TWO_MIN_MS, priorMatte, onMatte: recordMatte, maxNewMatteAttempts: Math.max(0, 2 - (currentAttempt.matteRequestIds?.length ?? 0)) });
      const patch = extracted.patch;
      Object.assign(currentAttempt, { extraction: extracted.method, extractionVersion: extracted.version, diffLargest: extracted.diff.largest, occluderShift: extracted.occluder?.mean });
      if (extracted.method === "deferred") {
        // Out of time before pass two: the render is kept, the next tick cuts it.
        currentAttempt.outcome = "pending: pass two deferred (out of time)";
        currentAttempt.stage = "painted";
        await checkpoint();
        return deferred();
      }
      // Store WHY a roll was rejected, not a generic summary. "too small",
      // "wider than tall" and "painted somewhere else" need different fixes, and
      // the stored reason is the only way to tell them apart afterwards.
      // Shape first, because it is free; identity second, because it costs a
      // fraction of a cent and only patches that already look like a child are
      // worth asking about. A render that moved the occluder, or a pass two
      // that kept the wrong thing, is named as such so the retry knows what to
      // do differently.
      const shape = extracted.renderProblem ?? (extracted.extractionProblem ? `extraction: ${extracted.extractionProblem}` : childProblem(patch));
      if (extracted.renderProblem) currentAttempt.renderProblem = extracted.renderProblem;
      if (extracted.extractionProblem) currentAttempt.extractionProblem = extracted.extractionProblem;
      if (!shape && remaining() < JUDGE_MIN_MS) {
        // Out of time before judging: the render and its matte are kept.
        currentAttempt.outcome = "pending: judging deferred (out of time)";
        currentAttempt.stage = "matted";
        await checkpoint();
        return deferred();
      }
      const boardCrop = shape ? undefined : await boardComposite({
        base: sceneArt,
        foreground: scene.art.foreground ? await loadSceneArt(c.appUrl, scene.art.foreground) : undefined,
        art, patch: patch.webp, rect: patch.geometry.rect, layer: slot.layer, flip: slot.flip,
      });
      judged = shape ? null : await judgeOf(c, patch.webp, input, label, boardCrop!);
      if (judged) {
        spent += judged.costCents;
        if (judged.costUnknown) ledger.unknownCost = true;
      }
      const last = currentAttempt;
      last.judgeCents = judged?.costCents ?? 0;
      const problem = shape ?? (judged?.verdict === "bad" ? `does not show ${input.childName}: ${judged.reason}` : null);
      last.outcome = problem ? `rejected: ${problem.slice(0, 80)}` : judged?.verdict === "unknown" ? "held: uncertain review" : "accepted";
      delete last.stage;
      if (problem) {
        lastError = problem;
        const keep = await storeAsset(c, {
          ownerId: input.ownerId,
          type: "REJECTED_PATCH",
          visibility: "PRIVATE",
          buffer: edit.png,
          mimeType: "image/png",
          provider: c.avatars.id,
          providerRequestId: edit.providerRequestId,
          costCents: edit.costCents,
        }).catch((err: unknown) => {
          console.warn(`[patch] ${label}: cannot keep the rejected render:`, err instanceof Error ? err.message : err);
          return null;
        });
        if (keep) rejected.push(keep.id);
        continue;
      }
      const asset = await storeAsset(c, {
        ownerId: input.ownerId,
        type: "TARGET_SPRITE",
        visibility: "GAME",
        buffer: patch.webp,
        mimeType: "image/webp",
        width: patch.width,
        height: patch.height,
        provider: c.avatars.id,
        providerRequestId: edit.providerRequestId,
        costCents: edit.costCents,
      });
      await c.db.targetVariantAsset.update({
        where: { id: row.id },
        data: {
          assetId: asset.id,
          rectJson: JSON.stringify(patch.geometry.rect),
          hitRectJson: JSON.stringify(patch.geometry.hitRect),
          headAnchorJson: JSON.stringify(patch.geometry.anchor),
          provider: c.avatars.id,
          model,
          promptVersion: PROMPT_VERSION,
          costCents: Math.round(ledger.exactCents + spent),
          usageJson: JSON.stringify(withLedger(usage, ledger, spent, attemptLog, false)),
          rejectedAssetIdsJson: rejected.length > 0 ? JSON.stringify(rejected) : null,
          judgeJson: judged ? JSON.stringify(judged) : null,
          durationMs: { increment: elapsed },
          status: "GENERATED",
          lastError: null,
        },
      });
      return { ...base, status: "GENERATED", costCents: (existing?.costCents ?? 0) + spent, newCostCents: spent, attempts, durationMs: elapsed, model };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // A request that timed out may or may not have been billed. That is not
      // zero; it is unknown, and the ledger says so.
      if (/timed out|out of time/i.test(lastError)) ledger.unknownCost = true;
      const last = attemptLog[attemptLog.length - 1];
      if (last && last.outcome.startsWith("pending")) last.outcome = `error: ${lastError.slice(0, 80)}`;
      else attemptLog.push({ at: new Date().toISOString(), model: model ?? null, rollCents: 0, judgeCents: 0, durationMs: 0, requestId: null, outcome: `error: ${lastError.slice(0, 80)}` });
    }
  }

  const totalAttempts = (existing?.attempts ?? 0) + attempts;
  await c.db.targetVariantAsset.update({
    where: { id: row.id },
    data: {
      status: "FAILED",
      lastError: lastError.slice(0, 500),
      costCents: Math.round(ledger.exactCents + spent),
      // A failed roll's usage and verdict used to be dropped with it, which
      // left the most expensive rows in a game the least explained.
      usageJson: JSON.stringify(withLedger(usage, ledger, spent, attemptLog, ledger.unknownCost)),
      judgeJson: judged ? JSON.stringify(judged) : null,
      rejectedAssetIdsJson: rejected.length > 0 ? JSON.stringify(rejected) : null,
      durationMs: { increment: elapsed },
      model,
    },
  });
  return {
    ...base,
    status: "FAILED",
    costCents: (existing?.costCents ?? 0) + spent,
    newCostCents: spent,
    attempts,
    durationMs: elapsed,
    model,
    error: lastError,
    capped: totalAttempts >= MAX_ATTEMPTS_PER_SPOT,
  };
}

/**
 * Is the thing we painted actually this child?
 *
 * The shape checks accept a scooter, a horse's head and a pair of legs — over
 * one nine-board game, four of twenty-six patches that passed them were not the
 * child at all, and nothing further down could tell: the composer places what it
 * is given and automated QA measures rectangles. So the picture is looked at.
 *
 * Returns a rejection reason, or null to let the patch through. A judge that
 * cannot answer ("unknown") lets it through and says so on the row, because
 * refusing work over a misconfigured judge would be worse than the problem —
 * the pipeline turns those into a game a human has to approve.
 */
async function judgeOf(c: Container, webp: Buffer, input: { reference: Buffer; childName: string; ageYears?: number | null }, label: string, boardCrop: Buffer): Promise<PatchJudgement> {
  return c.judge.judge({ patchPng: webp, reference: input.reference, childName: input.childName, ageYears: input.ageYears, label, boardCrop }).catch(
    (err: unknown): PatchJudgement => ({ verdict: "unknown", reason: err instanceof Error ? err.message.slice(0, 120) : "judge failed", costCents: 0, costUnknown: true }),
  );
}

/** One roll, as the ledger remembers it. */
interface LedgerAttempt {
  at: string;
  model: string | null;
  rollCents: number;
  judgeCents: number;
  durationMs: number;
  requestId: string | null;
  outcome: string;
  evidenceAssetId?: string;
  /** How the child was cut out of the render, and what pass two cost — over every answer it gave. */
  extraction?: "matte" | "diff" | "deferred";
  matteCents?: number;
  matteRequestId?: string | null;
  matteRequestIds?: Array<string | null>;
  matteCalls?: Array<{ requestId: string | null; costCents: number; usage?: Record<string, number>; problem?: string }>;
  /** The last pass-two answer, and all of them; each is a private PATCH_EVIDENCE asset. */
  matteEvidenceAssetId?: string;
  matteEvidenceAssetIds?: string[];
  /** Where a slice ran out of time: what this attempt has paid for and kept. */
  stage?: "painted" | "matted";
  resumedAt?: string;
  renderProblem?: string;
  extractionProblem?: string;
}

const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Retry advice is selected from fixed code, never interpolated from model prose. */
export function repairInstruction(judgeJson: string | null | undefined): string {
  try {
    const prior = JSON.parse(judgeJson ?? "{}") as PatchJudgement;
    if (prior.verdict !== "bad") return "";
    const checks = prior.checks;
    const instructions = [
      checks?.faceIntegrity === "fail" ? "Keep the entire face clear of occluders: both eyes, nose, mouth and continuous skin must be visible." : "",
      checks?.bodyPlacement === "fail" ? "The previous placement was physically impossible. Draw a complete supported standing or seated body, with feet on a real visible surface; only existing foreground objects may hide it. Never use a floating head or a torso through the ground." : "",
      checks?.identity === "fail" ? "Re-check the full reference sheet and preserve this child's face shape, curls or hairstyle, and skin tone." : "",
      checks?.ageProportions === "fail" ? "The previous child looked the wrong age or size. Preserve the stated age, youthful face, narrow shoulders, small hands and child-sized limbs. Do not reuse adult proportions from nearby people or age up the reference." : "",
      checks?.anatomy === "fail" ? "Repair the complete body with exactly two arms and two legs, coherent joints and each hand belonging to its own arm. Use a simple natural supported pose and preserve genuine occlusion." : "",
      checks?.style === "fail" ? "Match the neighbouring painted people: same line weight, flat shading, texture and palette, not glossy or photographic." : "",
    ].filter(Boolean);
    return instructions.length ? ` Repair requirements: ${instructions.join(" ")}` : "";
  } catch { return ""; }
}

/** The exact money so far, and whether any of it is unknown. */
interface Ledger {
  exactCents: number;
  unknownCost: boolean;
  attempts: LedgerAttempt[];
}

/**
 * The ledger lives inside usageJson, beside the provider's token counts, so no
 * column had to change. Rows written before it carry only the rounded column;
 * that is what they start from.
 */
export function readLedger(usageJson: string | null | undefined, costCents: number): Ledger {
  if (usageJson) {
    try {
      const raw = JSON.parse(usageJson) as { ledger?: Partial<Ledger> };
      if (raw.ledger && typeof raw.ledger.exactCents === "number") {
        return { exactCents: raw.ledger.exactCents, unknownCost: Boolean(raw.ledger.unknownCost), attempts: Array.isArray(raw.ledger.attempts) ? (raw.ledger.attempts as LedgerAttempt[]) : [] };
      }
    } catch {
      /* not ours */
    }
  }
  return { exactCents: costCents, unknownCost: false, attempts: [] };
}

function withLedger(usage: Record<string, number> | undefined, ledger: Ledger, spent: number, attempts: LedgerAttempt[], unknownCost: boolean): Record<string, unknown> {
  return {
    ...(usage ?? {}),
    ledger: { exactCents: Math.round((ledger.exactCents + spent) * 1_000_000) / 1_000_000, unknownCost: unknownCost || ledger.unknownCost, attempts },
  };
}

function existingRejected(json: string | null | undefined): string[] | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : null;
  } catch {
    return null;
  }
}

/**
 * What this game still owes: hiding spots that are unfinished but not yet out of
 * attempts, and spots nobody may retry again.
 *
 * The pipeline used to compose as soon as it had walked the list once, so a
 * world whose child failed on this tick shipped without her - the tap target
 * fell back to a procedural sprite and automated QA, which only checks the
 * shapes it is given, waved it through.
 */
/**
 * Finished spots that nothing actually looked at.
 *
 * Only meaningful when a judge is configured: if one is, a spot it could not
 * answer for is a spot whose picture nobody checked, and a game made of those
 * should be seen by a person rather than delivered on the strength of its
 * rectangles.
 */
export async function spotsUnjudged(c: Container, gameId: string): Promise<number> {
  if (c.judge.id === "none") return 0;
  const rows = await c.db.targetVariantAsset.findMany({
    where: { targetInstance: { gameScene: { gameId } }, status: { in: ["GENERATED", "APPROVED"] } },
    select: { judgeJson: true },
  });
  return rows.filter((r) => {
    if (!r.judgeJson) return true;
    try {
      const judgement = JSON.parse(r.judgeJson) as PatchJudgement;
      if (judgement.verdict !== "ok") return true;
      // Resuming old work must not promote a flat-background identity-only
      // verdict into a current board-quality approval. Hold, without rerendering.
      return c.judge.id === "openai" && (judgement.version !== BOARD_JUDGE_VERSION || BOARD_CHECKS.some(key => judgement.checks?.[key] !== "pass"));
    } catch {
      return true;
    }
  }).length;
}

export async function spotsOutstanding(c: Container, gameId: string, variants: Variant[]): Promise<{ retryable: number; capped: number }> {
  const rows = await c.db.targetInstance.findMany({
    where: { gameScene: { gameId }, status: { notIn: ["GENERATED", "APPROVED"] } },
    select: { variants: { select: { variant: true, attempts: true, status: true } } },
  });
  let retryable = 0;
  let capped = 0;
  for (const row of rows) {
    const stuck = variants.every((v) => {
      const asset = row.variants.find((a) => a.variant === v);
      return Boolean(asset && asset.status !== "GENERATED" && asset.status !== "APPROVED" && asset.attempts >= MAX_ATTEMPTS_PER_SPOT);
    });
    if (stuck) capped++;
    else retryable++;
  }
  return { retryable, capped };
}
