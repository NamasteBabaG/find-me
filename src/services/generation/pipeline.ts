import { newId } from "@/lib/ids";
import { env, flag, spendGuard } from "@/lib/env";
import { spendAllowedFor, underDailyCeiling } from "@/domain/spend-policy";
import { isGenerating, type GameStatus } from "@/domain/order-state";
import { BOARDS_PER_WORLD } from "@/domain/package";
import { GameConfigSchema } from "@/domain/game/config";
import type { CropBox } from "@/infra/generation/types";
import type { Container } from "../container";
import { readAssetBuffer, storeAsset } from "../asset.service";
import { statusOf, transitionGame } from "../game-status";
import { sceneBySlug } from "../scene-catalog.service";
import { SYSTEM, audit } from "../audit.service";
import { persistGameConfig } from "./scene-composer";
import { publishGame } from "../publish.service";
import { generateSlotPatch, slotOf, spotsOutstanding, spotsUnjudged, type PatchOutcome, type Variant } from "./slot-patches";
import { styleReference } from "./patch";
import { loadSceneArt } from "./scene-art";

/**
 * Background generation. Every step is idempotent and resumable:
 *   avatar → targets → compose → qa
 * Re-running the pipeline after a crash or a "regenerate" skips finished work.
 */
type StepName = "avatar" | "targets" | "compose" | "qa";
type StepRecord = { status: "done" | "failed" | "running"; startedAt: string; finishedAt?: string; error?: string };

/** States the pipeline can pick up and carry forward — the queue asks the same question. */
/**
 * How long a run may go quiet before another may take over. Longer than one
 * slice, so a healthy run is never interrupted; short enough that a crashed one
 * does not strand the game.
 */
export const LEASE_MS = 6 * 60_000;

export const RESUMABLE_STATUSES: readonly GameStatus[] = ["PAID", "AVATAR_GENERATING", "TARGETS_GENERATING", "SCENES_COMPOSING", "NEEDS_REGENERATION", "GENERATION_FAILED"];

/**
 * The most a single world may spend before a human is asked to look.
 *
 * Retrying until every spot is out of attempts is right when spots fail one at a
 * time, and ruinous when the model is having a bad day: 27 spots x 6 attempts is
 * around eleven dollars against a world that sells for about ten. A world costs
 * roughly three dollars when things go well and the worst real one so far cost
 * $5.18, so this is a ceiling on the pathological case, not a target — a game
 * that reaches it stops and goes to MANUAL_REVIEW with whatever it has.
 */
const MAX_CENTS_PER_WORLD = 600;

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
  // The kill switch. Spend is the one thing here that cannot be undone by a
  // rollback, so stopping it must not need a deploy: flipping GENERATION_ENABLED
  // leaves every job exactly where it is, and the next tick picks them up when
  // it goes back on.
  if (env().GENERATION_ENABLED === "off") {
    console.warn(`[generate] ${gameId}: GENERATION_ENABLED=off — leaving the job for later`);
    return;
  }
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, scenes: { include: { targets: true }, orderBy: { orderIndex: "asc" } } } });
  if (!game || !game.childProfile) return;
  const status = statusOf(game);
  if (!RESUMABLE_STATUSES.includes(status)) return; // nothing to do (idempotent)

  // The last gate before the model is paid. Checkout and the sandbox till check
  // the same rule; this one is for anything that reaches PAID some other way.
  const guard = spendGuard();
  if (guard.appEnv === "qa" && guard.realGeneration) {
    const owner = game.ownerId ? await c.db.user.findUnique({ where: { id: game.ownerId }, select: { email: true } }) : null;
    if (!spendAllowedFor(guard, owner?.email)) {
      console.warn(`[generate] ${gameId}: the owner is not a listed QA tester — leaving the job untouched`);
      return;
    }
  }
  const ceiling = env().GENERATION_DAILY_CENTS;
  if (!underDailyCeiling(await spentTodayCents(c), ceiling)) {
    console.warn(`[generate] ${gameId}: today's spending ceiling (${ceiling} cents) is reached — leaving the job for tomorrow`);
    return;
  }

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
  // A game that failed and is being retried must not keep wearing the old error:
  // a finished game carrying one makes "did this succeed?" impossible to answer.
  if (game.lastError) await c.db.game.update({ where: { id: gameId }, data: { lastError: null } });
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
      const request = { originalPhoto: photo, mimeType: original.mimeType, crop, childName: child.displayName, styleRef: await boardStyle(c, game.scenes) };
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

    // Spend already booked to this game, across every tick that has run.
    const spentSoFar = (await c.db.targetVariantAsset.aggregate({ where: { targetInstance: { gameScene: { gameId } } }, _sum: { costCents: true } }))._sum.costCents ?? 0;
    const budgetCents = MAX_CENTS_PER_WORLD * Math.max(1, game.scenes.length / BOARDS_PER_WORLD);
    let overBudget = spentSoFar >= budgetCents;

    let ranOutOfTime = false;
    for (const gs of game.scenes) {
      const def = sceneBySlug(gs.sceneSlug);
      for (const target of def.targets) {
        if (options.deadlineAt && Date.now() > options.deadlineAt) {
          ranOutOfTime = true;
          break;
        }
        if (overBudget) break;
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
            // Cheap first, careful on the retry. Most hiding spots land on the
            // first roll, and at low quality that roll costs 2 cents instead of
            // 7; the ones that do not are exactly the awkward spots, and those
            // get the better model. Measured over one world: 26 of 27 spots at
            // low for $1.01, against $4.5 at medium — but a visible minority of
            // low patches come out soft or fragmentary, which is what the
            // retry is for.
            const quality = env().GENERATION_PATCH_RETRY_QUALITY && row.attempts > 0 ? env().GENERATION_PATCH_RETRY_QUALITY : undefined;
            const outcome = await generateSlotPatch(c, { targetInstanceId: row.id, scene: def, target, variant, reference, childName: refreshedChild.displayName, ownerId: refreshedChild.ownerId, quality });
            outcomes.push(outcome);
            spent += outcome.newCostCents;
            if (outcome.status === "GENERATED") ok++;
          }
          // One good hiding spot is a playable target; none is one a human must look at.
          await c.db.targetInstance.update({
            where: { id: row.id },
            data: { spriteKind: "image", status: ok > 0 ? "GENERATED" : "NEEDS_REGENERATION", attempts: { increment: 1 }, costCents: { increment: Math.round(spent) } },
          });
          // Heartbeat: a minute of painting must not let the lease go stale.
          await c.db.generationJob.update({ where: { id: jobId }, data: { currentStep: "targets" } });
          if (spentSoFar + outcomes.reduce((n, o) => n + o.newCostCents, 0) >= budgetCents) overBudget = true;
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
      if (ranOutOfTime || overBudget) break;
      // Only once every hiding spot in this world landed. Marking the world
      // GENERATED with a target still missing is what let a board ship with the
      // child absent from it.
      const left = await c.db.targetInstance.count({ where: { gameSceneId: gs.id, status: { notIn: ["GENERATED", "APPROVED"] } } });
      await c.db.gameScene.update({ where: { id: gs.id }, data: { generationStatus: left === 0 ? "GENERATED" : "NEEDS_REGENERATION" } });
    }
    if (outcomes.length > 0) {
      // Count what happened, not what is left over. A SKIPPED spot is one this
      // slice did not touch — counting it as generated made a slice that painted
      // nothing report a full board, and hid the failures underneath.
      const spent = outcomes.reduce((n, o) => n + o.newCostCents, 0);
      const generated = outcomes.filter((o) => o.status === "GENERATED").length;
      const failed = outcomes.filter((o) => o.status === "FAILED");
      const skipped = outcomes.filter((o) => o.status === "SKIPPED").length;
      console.log(
        `[generate] ${gameId}: ${generated} painted, ${failed.length} failed, ${skipped} skipped, ${(spent / 100).toFixed(2)} USD, ${Math.round(outcomes.reduce((n, o) => n + o.durationMs, 0) / 1000)}s`,
      );
      for (const f of failed) console.warn(`[generate] ${gameId}: ${f.sceneSlug}/${f.targetId}/${f.variant} failed${f.capped ? " (out of attempts)" : ""} - ${f.error}`);
      c.analytics.track("patches_generated", { generated, failed: failed.length, skipped, costCents: Math.round(spent) });
    }
    if (ranOutOfTime) {
      // Hand the lease back. Leaving it RUNNING would make the next tick wait
      // for the lease to go stale, so a game would advance one slice every six
      // minutes instead of continuously. Nothing is lost: the next tick resumes
      // at the next unfinished hiding spot.
      await mark("targets", { status: "running" });
      await c.db.generationJob.update({ where: { id: job.id }, data: { status: "QUEUED", currentStep: "targets" } });
      console.log(`[generate] ${gameId}: out of time, ${outcomes.length} hiding spots done this slice`);
      return;
    }
    // A spot that failed this slice but has attempts left is unfinished work, not
    // a result. Composing here is what shipped a world with a child missing.
    const outstanding = canPatch ? await spotsOutstanding(c, gameId, variants) : { retryable: 0, capped: 0 };
    if (overBudget) {
      const spent = spentSoFar + outcomes.reduce((n, o) => n + o.newCostCents, 0);
      console.warn(`[generate] ${gameId}: stopped at ${(spent / 100).toFixed(2)} USD (ceiling ${(budgetCents / 100).toFixed(2)}), ${outstanding.retryable + outstanding.capped} hiding spots unfinished`);
    } else if (outstanding.retryable > 0) {
      await mark("targets", { status: "running" });
      await c.db.generationJob.update({ where: { id: job.id }, data: { status: "QUEUED", currentStep: "targets" } });
      console.log(`[generate] ${gameId}: ${outstanding.retryable} hiding spots still to retry, handing back for the next tick`);
      return;
    }
    await mark("targets", { status: "done", finishedAt: new Date().toISOString(), error: outstanding.capped > 0 ? `${outstanding.capped} hiding spots out of attempts` : undefined });

    // ── Step 3: compose ──
    await mark("compose", { status: "running", startedAt: new Date().toISOString() });
    await transitionGame(c, gameId, "SCENES_COMPOSING", SYSTEM);
    const config = await persistGameConfig(c, gameId);
    await mark("compose", { status: "done", finishedAt: new Date().toISOString() });

    // ── Step 4: automated QA ──
    await mark("qa", { status: "running", startedAt: new Date().toISOString() });
    // automatedQa checks the shapes it is given; it cannot know a target fell back
    // to a procedural sprite because the painter gave up on it. That is exactly
    // the case a human has to see, so it is added here where the count is known.
    const unfinished = overBudget ? outstanding.retryable + outstanding.capped : outstanding.capped;
    const unjudged = canPatch ? await spotsUnjudged(c, gameId) : 0;
    const problems = [
      ...automatedQa(config),
      ...(unfinished > 0 ? [`${unfinished} hiding spots could not be painted and fell back to a drawn sprite${overBudget ? " (the world reached its spending ceiling)" : ""}`] : []),
      ...(unjudged > 0 ? [`${unjudged} hiding spots were never checked against the child — nothing confirmed the picture is her`] : []),
    ];
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

/** Every cent the painter and the judge put on the account since midnight UTC. */
async function spentTodayCents(c: Container): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [assets, spots] = await Promise.all([
    c.db.asset.aggregate({ _sum: { costCents: true }, where: { createdAt: { gte: start } } }),
    c.db.targetVariantAsset.aggregate({ _sum: { costCents: true }, where: { updatedAt: { gte: start } } }),
  ]);
  // Assets carry the render cost; the spot rows carry judging and rejected rolls. Counted both, the number errs high, which is the right way for a ceiling to err.
  return (assets._sum.costCents ?? 0) + (spots._sum.costCents ?? 0);
}

/**
 * A piece of the child's first world, as the style her drawing has to match.
 *
 * Described only in words the model drew a soft, nearly photographic child, who
 * then had to be painted into saturated gouache: she looked pasted on, and the
 * inpaints were rejected for it. Showing it one board fixes both. Never fatal —
 * a missing board file must not stop a paid game, it only costs the guidance.
 */
async function boardStyle(c: Container, scenes: Array<{ sceneSlug: string }>): Promise<Buffer | undefined> {
  const first = scenes[0];
  if (!first) return undefined;
  try {
    const def = sceneBySlug(first.sceneSlug);
    const target = def.targets[0];
    if (!target) return undefined;
    const art = await loadSceneArt(c.appUrl, def.art.base);
    return await styleReference(art, { width: def.art.width, height: def.art.height }, slotOf(target, "A"));
  } catch (err) {
    console.warn("[generate] no style reference for the character sheet:", err instanceof Error ? err.message : err);
    return undefined;
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
