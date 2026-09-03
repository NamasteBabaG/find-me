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
import { generateSlotPatch, type PatchOutcome, type Variant } from "./slot-patches";

/**
 * Background generation. Every step is idempotent and resumable:
 *   avatar → targets → compose → qa
 * Re-running the pipeline after a crash or a "regenerate" skips finished work.
 */
type StepName = "avatar" | "targets" | "compose" | "qa";
type StepRecord = { status: "done" | "failed" | "running"; startedAt: string; finishedAt?: string; error?: string };

/** States the pipeline can pick up and carry forward — the queue asks the same question. */
export /**
 * How long a run may go quiet before another may take over. Longer than one
 * slice, so a healthy run is never interrupted; short enough that a crashed one
 * does not strand the game.
 */
const LEASE_MS = 6 * 60_000;

export const RESUMABLE_STATUSES: readonly GameStatus[] = ["PAID", "AVATAR_GENERATING", "TARGETS_GENERATING", "SCENES_COMPOSING", "NEEDS_REGENERATION", "GENERATION_FAILED"];

export interface PipelineOptions {
  /**
   * Stop after the hiding spot that is running when this passes, leaving the job
   * RUNNING so the next tick picks it up.
   *
   * A real generation is ~55s per hiding spot and a three-world game is nine of
   * them, which no serverless request will survive. The steps were always
   * resumable; this makes stopping deliberate instead of a timeout.
   */
  deadlineAt?: number;
}

export async function runGenerationPipeline(c: Container, gameId: string, options: PipelineOptions = {}): Promise<void> {
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, scenes: { include: { targets: true }, orderBy: { orderIndex: "asc" } } } });
  if (!game || !game.childProfile) return;
  const status = statusOf(game);
  if (!RESUMABLE_STATUSES.includes(status)) return; // nothing to do (idempotent)

  // One job row per game, at a deterministic id: two runners racing to create
  // one cannot end up with two, and two rows would mean two leases and no
  // mutual exclusion at all.
  const jobId = `job_${gameId}`;
  const job =
    (await c.db.generationJob.findUnique({ where: { id: jobId } })) ??
    (await c.db.generationJob.create({ data: { id: jobId, gameId } }).catch(() => c.db.generationJob.findUniqueOrThrow({ where: { id: jobId } })));

  // Claim the lease. The page nudges this on every poll and a cron nudges it
  // every five minutes, so concurrent runs are normal, not exceptional — and
  // without this each one saw "no avatar yet" and drew its own, which cost real
  // money three times over on the first live game.
  const claimed = await c.db.generationJob.updateMany({
    where: { id: jobId, OR: [{ status: { not: "RUNNING" } }, { updatedAt: { lt: new Date(Date.now() - LEASE_MS) } }] },
    data: { status: "RUNNING", attempts: { increment: 1 }, lastError: null },
  });
  if (claimed.count === 0) return; // someone else is already working on this game
  const steps: Record<string, StepRecord> = JSON.parse(job.stepsJson || "{}");
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
      const request = { originalPhoto: photo, mimeType: original.mimeType, crop, childName: child.displayName };
      if (c.avatars.createCharacter) {
        // One drawing of the child in the worlds own style, from several angles:
        // the reference every hiding spot is painted from, which is what keeps
        // her the same child in nine worlds. The cover avatar is cut from it.
        const character = await c.avatars.createCharacter(request);
        const sheet = await storeAsset(c, {
          ownerId: child.ownerId,
          type: "IDENTITY_SHEET",
          visibility: "PRIVATE",
          buffer: character.sheetPng,
          mimeType: "image/png",
          width: character.sheetWidth,
          height: character.sheetHeight,
          provider: c.avatars.id,
          providerRequestId: character.providerRequestId,
          costCents: character.costCents,
        });
        const avatarAsset = await storeAsset(c, {
          ownerId: child.ownerId,
          type: "AVATAR",
          visibility: "GAME",
          buffer: character.avatarPng,
          mimeType: "image/png",
          width: character.avatarWidth,
          height: character.avatarHeight,
          provider: c.avatars.id,
          providerRequestId: character.providerRequestId,
          costCents: 0,
        });
        await c.db.childProfile.update({ where: { id: child.id }, data: { avatarAssetId: avatarAsset.id, identityAssetId: sheet.id } });
      } else {
        const out = await c.avatars.createAvatar(request);
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
      }
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

    // Painting the child into a world needs the identity sheet, not the round avatar.
    const canPatch = Boolean(c.avatars.editSlotCrop) && Boolean(refreshedChild.identityAssetId);
    const reference = canPatch ? await readAssetBuffer(c, refreshedChild.identityAssetId as string) : null;
    const variants: Variant[] = flag("GENERATION_BOTH_VARIANTS") ? ["A", "B"] : ["A"];
    const outcomes: PatchOutcome[] = [];

    let ranOutOfTime = false;
    for (const gs of game.scenes) {
      const def = sceneBySlug(gs.sceneSlug);
      for (const target of def.targets) {
        if (options.deadlineAt && Date.now() > options.deadlineAt) {
          ranOutOfTime = true;
          break;
        }
        const row =
          gs.targets.find((t) => t.targetId === target.id) ??
          (await c.db.targetInstance.create({
            data: { id: newId("tgt"), gameSceneId: gs.id, targetId: target.id, targetType: target.targetType, slotAId: target.slots[0].id, slotBId: target.slots[1].id },
          }));
        if (row.status === "GENERATED" || row.status === "APPROVED") continue;
        if (canPatch && reference) {
          let spent = 0;
          let ok = 0;
          for (const variant of variants) {
            const outcome = await generateSlotPatch(c, { targetInstanceId: row.id, scene: def, target, variant, reference, childName: refreshedChild.displayName, ownerId: refreshedChild.ownerId });
            outcomes.push(outcome);
            spent += outcome.costCents;
            if (outcome.status === "GENERATED") ok++;
          }
          // One good hiding spot is a playable target; none is one a human must look at.
          await c.db.targetInstance.update({
            where: { id: row.id },
            data: { spriteKind: "image", status: ok > 0 ? "GENERATED" : "NEEDS_REGENERATION", attempts: { increment: 1 }, costCents: { increment: spent } },
          });
          // Heartbeat: a minute of painting must not let the lease go stale.
          await c.db.generationJob.update({ where: { id: jobId }, data: { currentStep: "targets" } });
          continue;
        }
        const out = await c.avatars.createTargetSprite({ avatarPng, sceneSlug: def.slug, targetType: target.targetType, bodyTemplate: target.bodyTemplate, childName: refreshedChild.displayName });
        if (out.kind === "composed") {
          await c.db.targetInstance.update({ where: { id: row.id }, data: { spriteKind: "composed", spriteAssetId: null, status: "GENERATED", attempts: { increment: 1 } } });
        } else {
          const sprite = await storeAsset(c, { ownerId: refreshedChild.ownerId, type: "TARGET_SPRITE", visibility: "GAME", buffer: out.png, mimeType: "image/png", width: out.width, height: out.height, provider: c.avatars.id, providerRequestId: out.providerRequestId, costCents: out.costCents });
          await c.db.targetInstance.update({ where: { id: row.id }, data: { spriteKind: "image", spriteAssetId: sprite.id, status: "GENERATED", attempts: { increment: 1 }, costCents: { increment: out.costCents } } });
        }
      }
      if (ranOutOfTime) break;
      await c.db.gameScene.update({ where: { id: gs.id }, data: { generationStatus: "GENERATED" } });
    }
    if (outcomes.length > 0) {
      const spent = outcomes.reduce((n, o) => n + o.costCents, 0);
      const failed = outcomes.filter((o) => o.status === "FAILED");
      console.log(`[generate] ${gameId}: ${outcomes.length - failed.length}/${outcomes.length} hiding spots, ${(spent / 100).toFixed(2)} USD, ${Math.round(outcomes.reduce((n, o) => n + o.durationMs, 0) / 1000)}s`);
      for (const f of failed) console.warn(`[generate] ${gameId}: ${f.sceneSlug}/${f.targetId}/${f.variant} failed - ${f.error}`);
      c.analytics.track("patches_generated", { generated: outcomes.length - failed.length, failed: failed.length, costCents: spent });
    }
    if (ranOutOfTime) {
      // Leave the job RUNNING: nothing is lost, the next tick resumes here.
      await mark("targets", { status: "running" });
      await c.db.generationJob.update({ where: { id: job.id }, data: { status: "RUNNING", currentStep: "targets" } });
      console.log(`[generate] ${gameId}: out of time, ${outcomes.length} hiding spots done this slice`);
      return;
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
      // Check every sprite that can actually be drawn, not just the default:
      // a per-variant slot patch belongs to one hiding spot (spriteByVariant).
      const drawn: [string, typeof t.sprite][] = [["sprite", t.sprite]];
      if (t.spriteByVariant?.A) drawn.push(["variant A", t.spriteByVariant.A]);
      if (t.spriteByVariant?.B) drawn.push(["variant B", t.spriteByVariant.B]);
      for (const [label, sprite] of drawn) {
        if (sprite.kind !== "image") continue;
        if (!sprite.url) problems.push(`${scene.slug}/${t.id}: ${label} has no url`);
        if (!sprite.rect) continue;
        const r = sprite.rect;
        if (r.x + r.w > 1.0001 || r.y + r.h > 1.0001) problems.push(`${scene.slug}/${t.id}: ${label} patch extends outside the scene`);
        // Without these a tap on the child's head misses (see target-geometry).
        if (!sprite.hitRect) problems.push(`${scene.slug}/${t.id}: ${label} patch has no hitRect`);
        if (!sprite.anchor) problems.push(`${scene.slug}/${t.id}: ${label} patch has no head anchor`);
        const hit = sprite.hitRect;
        if (hit && (hit.x < r.x - 0.001 || hit.y < r.y - 0.001 || hit.x + hit.w > r.x + r.w + 0.001 || hit.y + hit.h > r.y + r.h + 0.001)) {
          problems.push(`${scene.slug}/${t.id}: ${label} hitRect is not inside the patch`);
        }
        const a = sprite.anchor;
        if (a && hit && (a.x < hit.x - 0.001 || a.x > hit.x + hit.w + 0.001 || a.y < hit.y - 0.001 || a.y > hit.y + hit.h + 0.001)) {
          problems.push(`${scene.slug}/${t.id}: ${label} head anchor is outside the hitRect`);
        }
      }
    }
  }
  if (!parsed.data.child.avatarUrl) problems.push("missing avatar");
  return problems;
}
