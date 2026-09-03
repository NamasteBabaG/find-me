import sharp from "sharp";
import { newId } from "@/lib/ids";
import type { SceneDefinition, Target as SceneTarget } from "@/domain/scene/schema";
import { BODY_TEMPLATES } from "../../../content/body-templates";
import type { Container } from "../container";
import { storeAsset } from "../asset.service";
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
  costCents: number;
  attempts: number;
  durationMs: number;
  model?: string;
  error?: string;
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
const MAX_ATTEMPTS_PER_SPOT = 6;

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
  },
): Promise<PatchOutcome> {
  const { scene, target, variant } = input;
  const slot = slotOf(target, variant);
  const base: PatchOutcome = { sceneSlug: scene.slug, targetId: target.id, variant, status: "SKIPPED", costCents: 0, attempts: 0, durationMs: 0 };
  if (!c.avatars.editSlotCrop) return { ...base, error: `${c.avatars.id} cannot paint slot patches` };

  const existing = await c.db.targetVariantAsset.findUnique({ where: { targetInstanceId_variant: { targetInstanceId: input.targetInstanceId, variant } } });
  if (existing && (existing.status === "GENERATED" || existing.status === "APPROVED")) return { ...base, costCents: existing.costCents, attempts: existing.attempts };
  if (existing && existing.attempts >= MAX_ATTEMPTS_PER_SPOT) {
    return { ...base, costCents: existing.costCents, attempts: existing.attempts, error: `gave up after ${existing.attempts} attempts: ${existing.lastError ?? "no reason recorded"}` };
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
  let spent = 0;
  let attempts = 0;
  let elapsed = 0;
  let model: string | undefined;
  let usage: Record<string, number> | undefined;
  let lastError = "";

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const edit = await c.avatars.editSlotCrop({ crop, paintMask: mask, reference: input.reference, prompt, label });
      spent += edit.costCents;
      attempts += edit.attempts;
      elapsed += edit.durationMs;
      model = edit.model;
      usage = edit.usage ?? usage;
      const patch = await diffToPatch({ originalCrop: crop, editedCrop: edit.png, ctx, art, slot });
      // Store WHY a roll was rejected, not a generic summary. "too small",
      // "wider than tall" and "painted somewhere else" need different fixes, and
      // the stored reason is the only way to tell them apart afterwards.
      const problem = childProblem(patch);
      if (problem) {
        lastError = problem;
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
          costCents: { increment: spent },
          usageJson: usage ? JSON.stringify(usage) : null,
          durationMs: elapsed,
          status: "GENERATED",
          lastError: null,
        },
      });
      return { ...base, status: "GENERATED", costCents: spent, attempts, durationMs: elapsed, model };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      attempts += 1;
    }
  }

  await c.db.targetVariantAsset.update({
    where: { id: row.id },
    data: { status: "FAILED", lastError: lastError.slice(0, 500), attempts: { increment: attempts }, costCents: { increment: spent }, durationMs: elapsed, model },
  });
  return { ...base, status: "FAILED", costCents: spent, attempts, durationMs: elapsed, model, error: lastError };
}
