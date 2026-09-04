import sharp from "sharp";
import { newId } from "@/lib/ids";
import type { SceneDefinition, Target as SceneTarget } from "@/domain/scene/schema";
import { BODY_TEMPLATES } from "../../../content/body-templates";
import type { Container } from "../container";
import { storeAsset } from "../asset.service";
import type { PatchJudgement } from "@/infra/generation/types";
import { childProblem, diffToPatch, paintMask, slotContext, slotPrompt, PROMPT_VERSION } from "./patch";
import { loadSceneArt } from "./scene-art";

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
}

/**
 * How many rolls one hiding spot may ever cost, across all ticks.
 *
 * Retrying is normal — most spots land within four — but a slot the model
 * simply cannot paint will fail forever, and nothing stopped it: one spot spent
 * thirteen rolls and a third of a game's budget before this existed. A spot
 * that hits the cap is left FAILED for a human to look at; the game still ships,
 * because a target with no patch falls back to the procedural sprite.
 */
export const MAX_ATTEMPTS_PER_SPOT = 6;

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
    ownerId: string | null;
    tries?: number;
    /** Overrides the provider's quality for this attempt. */
    quality?: string;
  },
): Promise<PatchOutcome> {
  const { scene, target, variant } = input;
  const slot = slotOf(target, variant);
  const base: PatchOutcome = { sceneSlug: scene.slug, targetId: target.id, variant, status: "SKIPPED", costCents: 0, newCostCents: 0, attempts: 0, durationMs: 0 };
  if (!c.avatars.editSlotCrop) return { ...base, error: `${c.avatars.id} cannot paint slot patches` };

  const existing = await c.db.targetVariantAsset.findUnique({ where: { targetInstanceId_variant: { targetInstanceId: input.targetInstanceId, variant } } });
  if (existing && (existing.status === "GENERATED" || existing.status === "APPROVED")) return { ...base, costCents: existing.costCents, attempts: existing.attempts };
  if (existing && existing.attempts >= MAX_ATTEMPTS_PER_SPOT) {
    return { ...base, costCents: existing.costCents, attempts: existing.attempts, capped: true, error: `gave up after ${existing.attempts} attempts: ${existing.lastError ?? "no reason recorded"}` };
  }
  const row =
    existing ??
    (await c.db.targetVariantAsset.create({
      data: { id: newId("tva"), targetInstanceId: input.targetInstanceId, variant, slotId: slot.id, provider: c.avatars.id, promptVersion: PROMPT_VERSION },
    }));

  const art = { width: scene.art.width, height: scene.art.height };
  const ctx = slotContext(art, slot);
  const sceneArt = await loadSceneArt(c.appUrl, scene.art.base);
  const crop = await sharp(sceneArt).extract({ left: ctx.rect.x, top: ctx.rect.y, width: ctx.rect.w, height: ctx.rect.h }).png().toBuffer();
  const mask = paintMask(ctx, art, slot);
  const prompt = slotPrompt({
    mission: target.mission.en.replace("{name}", input.childName),
    bodyLabel: BODY_TEMPLATES[target.bodyTemplate]?.label.en,
    childPx: ctx.childPx,
  });
  const label = `${scene.slug}/${target.id}/${variant}`;

  // Default to a single roll: inside a request with a deadline, three rolls of
  // ~55s each is enough to overrun it. A spot that fails is not marked done, so
  // the next tick tries it again — the retries happen across ticks, not inside one.
  const tries = input.tries ?? 1;
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

  for (let attempt = 1; attempt <= tries; attempt++) {
    // One roll, one attempt — counted here so every way out of this iteration
    // counts the same. Adding the provider's own retry count and then adding
    // another on the way through the catch charged two attempts for one call,
    // and quietly halved the budget a spot was allowed.
    attempts += 1;
    try {
      const edit = await c.avatars.editSlotCrop({ crop, paintMask: mask, reference: input.reference, prompt, label, quality: input.quality });
      spent += edit.costCents;
      judged = null;
      elapsed += edit.durationMs;
      model = edit.model;
      usage = edit.usage ?? usage;
      const patch = await diffToPatch({ originalCrop: crop, editedCrop: edit.png, ctx, art, slot });
      // Store WHY a roll was rejected, not a generic summary. "too small",
      // "wider than tall" and "painted somewhere else" need different fixes, and
      // the stored reason is the only way to tell them apart afterwards.
      // Shape first, because it is free; identity second, because it costs a
      // fraction of a cent and only patches that already look like a child are
      // worth asking about.
      const shape = childProblem(patch);
      judged = shape ? null : await judgeOf(c, patch.webp, input, label);
      if (judged) spent += judged.costCents;
      const problem = shape ?? (judged?.verdict === "bad" ? `does not show ${input.childName}: ${judged.reason}` : null);
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
          attempts: { increment: attempts },
          costCents: { increment: Math.round(spent) },
          usageJson: usage ? JSON.stringify(usage) : null,
          rejectedAssetIdsJson: rejected.length > 0 ? JSON.stringify(rejected) : null,
          judgeJson: judged ? JSON.stringify({ verdict: judged.verdict, reason: judged.reason, model: judged.model }) : null,
          durationMs: elapsed,
          status: "GENERATED",
          lastError: null,
        },
      });
      return { ...base, status: "GENERATED", costCents: (existing?.costCents ?? 0) + spent, newCostCents: spent, attempts, durationMs: elapsed, model };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  const totalAttempts = (existing?.attempts ?? 0) + attempts;
  await c.db.targetVariantAsset.update({
    where: { id: row.id },
    data: {
      status: "FAILED",
      lastError: lastError.slice(0, 500),
      attempts: { increment: attempts },
      costCents: { increment: Math.round(spent) },
      rejectedAssetIdsJson: rejected.length > 0 ? JSON.stringify(rejected) : null,
      durationMs: elapsed,
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
async function judgeOf(c: Container, webp: Buffer, input: { reference: Buffer; childName: string }, label: string): Promise<PatchJudgement> {
  return c.judge.judge({ patchPng: webp, reference: input.reference, childName: input.childName, label }).catch(
    (err: unknown): PatchJudgement => ({ verdict: "unknown", reason: err instanceof Error ? err.message.slice(0, 120) : "judge failed", costCents: 0 }),
  );
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
      return (JSON.parse(r.judgeJson) as { verdict?: string }).verdict !== "ok";
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
