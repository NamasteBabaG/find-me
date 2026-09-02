import { newId } from "@/lib/ids";
import { flag } from "@/lib/env";
import { isGenerating, type GameStatus } from "@/domain/order-state";
import { GameConfigSchema } from "@/domain/game/config";
import type { CropBox } from "@/infra/generation/types";
import type { Container } from "../container";
import { readAssetBuffer, storeAsset } from "../asset.service";
import { statusOf, transitionGame } from "../game-status";
import { sceneBySlug } from "../scene-catalog.service";
import { SYSTEM, audit } from "../audit.service";
import { persistGameConfig } from "./scene-composer";
import { publishGame } from "../publish.service";

/**
 * Background generation. Every step is idempotent and resumable:
 *   avatar → targets → compose → qa
 * Re-running the pipeline after a crash or a "regenerate" skips finished work.
 */
type StepName = "avatar" | "targets" | "compose" | "qa";
type StepRecord = { status: "done" | "failed" | "running"; startedAt: string; finishedAt?: string; error?: string };

const RESUMABLE: GameStatus[] = ["PAID", "AVATAR_GENERATING", "TARGETS_GENERATING", "SCENES_COMPOSING", "NEEDS_REGENERATION", "NEEDS_NEW_PHOTO", "GENERATION_FAILED"];

export async function runGenerationPipeline(c: Container, gameId: string): Promise<void> {
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, scenes: { include: { targets: true }, orderBy: { orderIndex: "asc" } } } });
  if (!game || !game.childProfile) return;
  const status = statusOf(game);
  if (!RESUMABLE.includes(status)) return; // nothing to do (idempotent)

  const job =
    (await c.db.generationJob.findFirst({ where: { gameId, status: { in: ["QUEUED", "RUNNING", "FAILED"] } }, orderBy: { createdAt: "desc" } })) ??
    (await c.db.generationJob.create({ data: { id: newId("job"), gameId } }));
  const steps: Record<string, StepRecord> = JSON.parse(job.stepsJson || "{}");
  await c.db.generationJob.update({ where: { id: job.id }, data: { status: "RUNNING", attempts: { increment: 1 }, lastError: null } });
  if (status === "PAID") c.analytics.track("generation_started", { gameId });

  const mark = async (name: StepName, rec: Partial<StepRecord>) => {
    steps[name] = { ...(steps[name] ?? { status: "running", startedAt: new Date().toISOString() }), ...rec };
    await c.db.generationJob.update({ where: { id: job.id }, data: { currentStep: name, stepsJson: JSON.stringify(steps) } });
  };

  try {
    // ── Step 1: avatar ──
    await mark("avatar", { status: "running", startedAt: new Date().toISOString() });
    const child = await c.db.childProfile.findUniqueOrThrow({ where: { id: game.childProfile.id } });
    const avatarValid = child.avatarAssetId ? (await c.db.asset.findUnique({ where: { id: child.avatarAssetId } }))?.status === "READY" : false;
    if (!avatarValid) {
      if (status !== "AVATAR_GENERATING") await transitionGame(c, gameId, "AVATAR_GENERATING", SYSTEM);
      if (!child.originalPhotoAssetId) {
        await transitionGame(c, gameId, "NEEDS_NEW_PHOTO", SYSTEM, { reason: "no original photo" });
        await mark("avatar", { status: "failed", error: "no original photo", finishedAt: new Date().toISOString() });
        await c.db.generationJob.update({ where: { id: job.id }, data: { status: "FAILED", lastError: "no original photo" } });
        return;
      }
      const original = await c.db.asset.findUniqueOrThrow({ where: { id: child.originalPhotoAssetId } });
      const photo = await readAssetBuffer(c, original.id);
      const crop = child.photoCropJson ? (JSON.parse(child.photoCropJson) as CropBox) : null;
      const out = await c.avatars.createAvatar({ originalPhoto: photo, mimeType: original.mimeType, crop, childName: child.displayName });
      const avatarAsset = await storeAsset(c, {
        ownerId: child.ownerId,
        type: "AVATAR",
        visibility: "GAME",
        buffer: out.png,
        mimeType: "image/png",
        width: out.width,
        height: out.height,
        provider: c.avatars.id,
        providerRequestId: out.providerRequestId,
        costCents: out.costCents,
      });
      await c.db.childProfile.update({ where: { id: child.id }, data: { avatarAssetId: avatarAsset.id } });
    } else if (status === "PAID" || status === "NEEDS_NEW_PHOTO" || status === "GENERATION_FAILED") {
      await transitionGame(c, gameId, "AVATAR_GENERATING", SYSTEM);
    }
    await mark("avatar", { status: "done", finishedAt: new Date().toISOString() });

    // ── Step 2: targets ──
    await mark("targets", { status: "running", startedAt: new Date().toISOString() });
    const current = statusOf(await c.db.game.findUniqueOrThrow({ where: { id: gameId }, select: { status: true } }));
    if (current === "AVATAR_GENERATING" || current === "NEEDS_REGENERATION") await transitionGame(c, gameId, "TARGETS_GENERATING", SYSTEM);
    const refreshedChild = await c.db.childProfile.findUniqueOrThrow({ where: { id: game.childProfile.id } });
    const avatarPng = await readAssetBuffer(c, refreshedChild.avatarAssetId as string);

    for (const gs of game.scenes) {
      const def = sceneBySlug(gs.sceneSlug);
      for (const target of def.targets) {
        const row =
          gs.targets.find((t) => t.targetId === target.id) ??
          (await c.db.targetInstance.create({
            data: { id: newId("tgt"), gameSceneId: gs.id, targetId: target.id, targetType: target.targetType, slotAId: target.slots[0].id, slotBId: target.slots[1].id },
          }));
        if (row.status === "GENERATED" || row.status === "APPROVED") continue;
        const out = await c.avatars.createTargetSprite({ avatarPng, sceneSlug: def.slug, targetType: target.targetType, bodyTemplate: target.bodyTemplate, childName: refreshedChild.displayName });
        if (out.kind === "composed") {
          await c.db.targetInstance.update({ where: { id: row.id }, data: { spriteKind: "composed", spriteAssetId: null, status: "GENERATED", attempts: { increment: 1 } } });
        } else {
          const sprite = await storeAsset(c, { ownerId: refreshedChild.ownerId, type: "TARGET_SPRITE", visibility: "GAME", buffer: out.png, mimeType: "image/png", width: out.width, height: out.height, provider: c.avatars.id, providerRequestId: out.providerRequestId, costCents: out.costCents });
          await c.db.targetInstance.update({ where: { id: row.id }, data: { spriteKind: "image", spriteAssetId: sprite.id, status: "GENERATED", attempts: { increment: 1 }, costCents: { increment: out.costCents } } });
        }
      }
      await c.db.gameScene.update({ where: { id: gs.id }, data: { generationStatus: "GENERATED" } });
    }
    await mark("targets", { status: "done", finishedAt: new Date().toISOString() });

    // ── Step 3: compose ──
    await mark("compose", { status: "running", startedAt: new Date().toISOString() });
    await transitionGame(c, gameId, "SCENES_COMPOSING", SYSTEM);
    const config = await persistGameConfig(c, gameId);
    await mark("compose", { status: "done", finishedAt: new Date().toISOString() });

    // ── Step 4: automated QA ──
    await mark("qa", { status: "running", startedAt: new Date().toISOString() });
    const problems = automatedQa(config);
    if (problems.length > 0) {
      await c.db.game.update({ where: { id: gameId }, data: { lastError: problems.join("; ") } });
      await transitionGame(c, gameId, "QA_PENDING", SYSTEM, { problems });
      await transitionGame(c, gameId, "MANUAL_REVIEW", SYSTEM, { problems });
      await mark("qa", { status: "done", finishedAt: new Date().toISOString(), error: problems.join("; ") });
    } else {
      await transitionGame(c, gameId, "QA_PENDING", SYSTEM);
      await mark("qa", { status: "done", finishedAt: new Date().toISOString() });
      if (flag("QA_AUTO_APPROVE")) {
        await audit(c, SYSTEM, "qa:auto-approved", "Game", gameId);
        await publishGame(c, gameId, SYSTEM);
      }
    }
    await c.db.generationJob.update({ where: { id: job.id }, data: { status: "DONE", currentStep: null } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`generation pipeline failed for ${gameId}:`, err);
    await c.db.generationJob.update({ where: { id: job.id }, data: { status: "FAILED", lastError: message } });
    await c.db.game.update({ where: { id: gameId }, data: { lastError: message } });
    const now = statusOf(await c.db.game.findUniqueOrThrow({ where: { id: gameId }, select: { status: true } }));
    if (isGenerating(now)) await transitionGame(c, gameId, "GENERATION_FAILED", SYSTEM, { error: message });
    c.analytics.track("generation_failed", { gameId, reason: message.slice(0, 80) });
  }
}

/** Cheap structural checks — a human still looks before READY unless auto-approve is on. */
export function automatedQa(config: unknown): string[] {
  const parsed = GameConfigSchema.safeParse(config);
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  const problems: string[] = [];
  for (const scene of parsed.data.scenes) {
    if (scene.targets.length !== 3) problems.push(`${scene.slug}: expected 3 targets`);
    for (const t of scene.targets) {
      for (const s of t.slots) {
        if (s.x < 0.02 || s.x > 0.98 || s.y < 0.02 || s.y > 0.98) problems.push(`${scene.slug}/${t.id}: slot ${s.id} too close to the edge`);
      }
      if (t.sprite.kind === "image" && !t.sprite.url) problems.push(`${scene.slug}/${t.id}: sprite has no url`);
    }
  }
  if (!parsed.data.child.avatarUrl) problems.push("missing avatar");
  return problems;
}
