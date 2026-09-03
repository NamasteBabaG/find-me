import sharp from "sharp";
import { newId } from "@/lib/ids";
import type { SceneDefinition, Target as SceneTarget } from "@/domain/scene/schema";
import { BODY_TEMPLATES } from "../../../content/body-templates";
import type { Container } from "../container";
import { storeAsset } from "../asset.service";
import { diffToPatch, isPlausibleChild, paintMask, slotContext, slotPrompt, PROMPT_VERSION } from "./patch";
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

/** How much bigger than the child the painted blob may be before we call it a repaint. */
const MAX_BLOB_FACTOR = 6;

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

  const tries = input.tries ?? 3;
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
      // Too small means the model painted scenery, not a child; far too large
      // means it re-rendered the whole crop and the "patch" is the window.
      if (!isPlausibleChild(patch)) {
        lastError = `painted blob ${patch.largest}px, expected ≈ ${patch.expected}px`;
        continue;
      }
      if (patch.largest > patch.expected * MAX_BLOB_FACTOR) {
        lastError = `the model repainted the crop (${patch.largest}px vs ≈ ${patch.expected}px)`;
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
