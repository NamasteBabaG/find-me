import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import { sceneBySlug } from "../../scene-catalog.service";
import { WORLD_LOCAL_PATCH_HIDES, cropOf, maskOf } from "../../../domain/scene/local-patch-hides";
import { LOCAL_PATCH_SCENE_VERSION } from "../../../../content/scenes/local-patch-release";
import { GameConfigSchema } from "../../../domain/game/config";
import { LOCAL_PATCH_STYLE, runLocalPatchWorldSlice } from "../local-patch-world";
import { composeLocalPatchGame } from "../local-patch-player";
import { composeGameConfig, persistGameConfig } from "../scene-composer";
import { identityApprovedForDisplay } from "../board-wizard-identity-gate";
import { publishGame } from "../../publish.service";
import { ensurePlayerLink, resolvePlayToken } from "../../share-link.service";
import { selectPackage } from "../../create-flow.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import type { LocalPatchHideDeps } from "../local-patch-hide";
import { bill, boardPng, paintedCrop, paintedOk, PASSING_ANSWER, reply, seedApprovedGame } from "./local-patch-fixtures";

const allowed = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({
  env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
    GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", OPENAI_API_KEY: "synthetic-never-live" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: allowed.testers }),
  flag: () => false, adminEmails: () => [],
}));

let scratch: string, db: PrismaClient, c: Container;
const sendMail = vi.fn(async () => { throw new Error("Synthetic email service unavailable"); });
beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-local-patch-player-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "player.sqlite").split(path.sep).join("/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), secret: "synthetic-local-patch-player", appUrl: "http://localhost:3000",
    email: { id: "console", send: sendMail }, analytics: { track: () => {} }, emailFallbackTo: null } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Network is forbidden in synthetic local-patch player tests"); }));
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await db.$disconnect();
  const target = path.resolve(scratch);
  if (path.dirname(target) === realpathSync(tmpdir()) && path.basename(target).startsWith("findme-local-patch-player-")) rmSync(target, { recursive: true, force: true });
});

async function seed(gameId: string) {
  const seeded = await seedApprovedGame(c, db, { gameId, styleVersion: LOCAL_PATCH_STYLE, status: "TARGETS_GENERATING", withJob: true,
    scenes: WORLD_LOCAL_PATCH_HIDES.map(board => ({ slug: board.board, version: LOCAL_PATCH_SCENE_VERSION })) });
  allowed.testers.push(seeded.email);
  const avatar = await sharp(seeded.sheet).extract({ left: 0, top: 0, width: 512, height: 512 }).resize(256, 256).png().toBuffer();
  const avatarId = `ast-avatar-${gameId}`, storagePath = `game/${avatarId}.png`;
  await c.storage.put(storagePath, avatar, "image/png");
  await db.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", status: "READY",
    storagePath, mimeType: "image/png", bytes: avatar.length, width: 256, height: 256, provider: "openai" } });
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { avatarAssetId: avatarId } });
  return { ...seeded, avatarId };
}

function worker(gameId: string, refusedHide?: string, refusalAttempts = Infinity) {
  const calls: string[] = [];
  let refusedJudgements = 0;
  const hides = WORLD_LOCAL_PATCH_HIDES.flatMap(board => board.hides);
  const deps: LocalPatchHideDeps = {
    renderPolicySha256: "p".repeat(64), readBoardArt: () => boardPng(),
    render: async ({ requestKey, stylePng }) => {
      calls.push(requestKey);
      const hide = hides.find(candidate => requestKey.startsWith(`${candidate.id}:`));
      if (!hide) throw new Error(`Unknown synthetic hide ${requestKey}`);
      const attempt = Number(requestKey.split(":").at(-1)), mask = maskOf(hide), crop = cropOf(hide);
      const png = await sharp(await paintedCrop(stylePng, hide)).composite([{
        input: { create: { width: 8, height: 8, channels: 4, background: { r: attempt * 40, g: 40, b: 180, alpha: 1 } } },
        left: mask.left - crop.left + Math.floor(mask.width / 2), top: mask.top - crop.top + Math.floor(mask.height / 2),
      }]).png().toBuffer();
      return paintedOk(png, bill(`req-${gameId}-${requestKey}`));
    },
    judge: async ({ hideId }) => {
      calls.push(`judge:${hideId}`);
      const answer = hideId === refusedHide && ++refusedJudgements <= refusalAttempts
        ? { ...PASSING_ANSWER, childPresent: "fail", verdict: "fail", reason: "Synthetic missing child", faults: [{ check: "childPresent", where: "inside the designated patch" }] }
        : PASSING_ANSWER;
      return reply({ raw: JSON.stringify(answer), requestId: `req-${gameId}-judge-${calls.length}` });
    },
  };
  return { deps, calls };
}

describe("the full local-patch world becomes a playable product", () => {
  it("runs all nine boards and 27 hides through real slices, then publishes only the judged patches for both variants", async () => {
    const { gameId, avatarId } = await seed("player-complete"), w = worker(gameId);
    const unpurgedChild = await db.childProfile.findUniqueOrThrow({ where: { id: `chl-${gameId}` } });
    expect(await identityApprovedForDisplay(c, unpurgedChild)).toBe(true);
    expect(await identityApprovedForDisplay(c, { ...unpurgedChild, originalPhotoAssetId: null })).toBe(false);
    for (let i = 0; i < 27; i++) {
      const result = await runLocalPatchWorldSlice(c, w.deps, gameId);
      expect(result.outcomes).toHaveLength(1);
      expect(result.outcomes[0]?.state).toBe("generated");
      expect(result.blocked).toEqual([]);
      const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
      if (i < 26) {
        expect(game.status, `after ${i + 1} hides`).toBe("TARGETS_GENERATING");
        expect(game.configJson, "missing hides never publish an avatar fallback").toBeNull();
        expect(result.pending).toBe(true);
      } else {
        expect(game.status).toBe("READY");
        expect(result.pending).toBe(false);
      }
    }
    const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
    const config = GameConfigSchema.parse(JSON.parse(game.configJson!));
    expect(config.styleVersion).toBe(LOCAL_PATCH_STYLE);
    expect(config.scenes).toHaveLength(9);
    expect(config.scenes.flatMap(scene => scene.targets)).toHaveLength(27);
    expect(config.worlds).toHaveLength(1);
    expect(config.child.avatarUrl).toContain(avatarId);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(await db.auditLog.count({ where: { action: "email:failed", entityId: gameId } })).toBe(1);
    const link = await ensurePlayerLink(c, gameId);
    expect(await resolvePlayToken(c, link.token)).toMatchObject({ ok: true, game: { id: gameId, status: "READY", configJson: game.configJson } });
    for (const scene of config.scenes) {
      expect(scene.version).toBe(LOCAL_PATCH_SCENE_VERSION);
      expect(scene.art.foreground).toBeUndefined();
      for (const target of scene.targets) {
        expect(target.sprite.kind).toBe("image");
        expect(target.sprite).toMatchObject({ rect: expect.any(Object), hitRect: expect.any(Object), anchor: expect.any(Object) });
        expect(target.spriteByVariant?.A).toEqual(target.sprite);
        expect(target.spriteByVariant?.B).toEqual(target.sprite);
        if (target.sprite.kind === "image") expect(target.sprite.url).toContain("ast_lp_");
        for (const slot of target.slots) expect(slot).toMatchObject({ flip: false, rotation: 0, layer: "front" });
      }
    }
    expect(await db.targetVariantAsset.count({ where: { targetInstance: { gameScene: { gameId } }, variant: "A", status: "GENERATED" } })).toBe(27);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } })).toMatchObject({ status: "DONE", currentStep: null });
    const audit = await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId));
    expect(audit).toMatchObject({ held: false, reservedMicroUsd: 0 });
    expect(audit.settledMicroUsd).toBeGreaterThan(27 * 48_800);
    expect(w.calls).toHaveLength(54);
    const originalPhoto = await db.asset.findUniqueOrThrow({ where: { id: `ast-photo-${gameId}` } });
    expect(originalPhoto.status).toBe("DELETED");
    expect(await db.fileBlob.count({ where: { key: originalPhoto.storagePath } })).toBe(0);
    const child = await db.childProfile.findUniqueOrThrow({ where: { id: `chl-${gameId}` } });
    expect(child.originalPhotoAssetId).toBeNull();
    expect(await identityApprovedForDisplay(c, child),
      "privacy cleanup must not hide the already approved identity").toBe(true);
    expect(await identityApprovedForDisplay(c, { ...child, originalPhotoAssetId: "ast-another-photo" })).toBe(false);
    expect(await identityApprovedForDisplay(c, { ...child, ageYears: 4 })).toBe(false);
    expect(await identityApprovedForDisplay(c, { ...child, identityAssetId: "ast-another-identity" })).toBe(false);
    const purge = await db.auditLog.findFirstOrThrow({ where: { action: "local-patch:photo-purged-after-approval", entityId: child.identityAssetId! } });
    try {
      await db.auditLog.delete({ where: { id: purge.id } });
      expect(await identityApprovedForDisplay(c, child), "a missing photo alone is not approval").toBe(false);
    } finally { await db.auditLog.create({ data: purge }); }
    try {
      await db.auditLog.update({ where: { id: purge.id }, data: { metaJson: JSON.stringify({ ...JSON.parse(purge.metaJson!), approvalFingerprint: "different-approval" }) } });
      expect(await identityApprovedForDisplay(c, child), "a purge for a different approval cannot authorize display").toBe(false);
    } finally { await db.auditLog.update({ where: { id: purge.id }, data: { metaJson: purge.metaJson } }); }
    expect(await identityApprovedForDisplay(c, child)).toBe(true);
    const recomposed = await composeGameConfig(c, gameId);
    expect(recomposed.scenes.flatMap(scene => scene.targets).map(target => target.sprite)).toEqual(config.scenes.flatMap(scene => scene.targets).map(target => target.sprite));
    await expect(persistGameConfig(c, gameId)).rejects.toThrow("fenced world finalizer");
    expect((await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson).toBe(game.configJson);
    for (let i = 0; i < 3; i++) {
      expect(await runLocalPatchWorldSlice(c, w.deps, gameId)).toMatchObject({ claimed: false, pending: false, outcomes: [] });
    }
    expect(w.calls).toHaveLength(54);
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId))).settledMicroUsd).toBe(audit.settledMicroUsd);
    expect(sendMail).toHaveBeenCalledTimes(1);

    // Asset metadata alone is insufficient. The composer checks the actual
    // persisted picture against the visual receipt before reusing it.
    const asset = await db.asset.findFirstOrThrow({ where: { provider: "local-patch", providerRequestId: gameId, type: "TARGET_SPRITE" } });
    const original = await c.storage.get(asset.storagePath);
    try {
      await c.storage.put(asset.storagePath, Buffer.from("synthetic tampered bytes"), "image/png");
      await expect(composeLocalPatchGame(c, gameId)).rejects.toThrow("not the picture that was judged");
      await expect(composeGameConfig(c, gameId)).rejects.toThrow("not the picture that was judged");
    } finally { await c.storage.put(asset.storagePath, original, "image/png"); }
    expect(fetch).not.toHaveBeenCalled();
  }, 240_000);

  it("a refused hide gets one end-of-world repair and then holds the game instead of buying a fourth or publishing 26 appearances", async () => {
    const { gameId } = await seed("player-refused"), refused = WORLD_LOCAL_PATCH_HIDES[0]!.hides[0]!.id, w = worker(gameId, refused);
    const first = await runLocalPatchWorldSlice(c, w.deps, gameId, { maxHides: 27 });
    expect(first.pending).toBe(true);
    expect(await db.game.findUniqueOrThrow({ where: { id: gameId } })).toMatchObject({ status: "TARGETS_GENERATING", configJson: null });
    await expect(composeLocalPatchGame(c, gameId)).rejects.toThrow("approved painted appearance");
    await expect(composeGameConfig(c, gameId)).rejects.toThrow("approved painted appearance");
    await expect(publishGame(c, gameId, { type: "ADMIN", id: "synthetic-admin" })).rejects.toThrow("not completely approved and ready");
    const second = await runLocalPatchWorldSlice(c, w.deps, gameId, { maxHides: 27 });
    expect(second.outcomes[0]).toMatchObject({ hideId: refused, attempt: 2, state: "gave-up" });
    expect(second.pending).toBe(true);
    expect(await db.game.findUniqueOrThrow({ where: { id: gameId } })).toMatchObject({ status: "TARGETS_GENERATING", configJson: null });
    const repair = await runLocalPatchWorldSlice(c, w.deps, gameId, { maxHides: 27 });
    expect(repair.outcomes[0]).toMatchObject({ hideId: refused, attempt: 3, state: "gave-up" });
    expect(repair.pending).toBe(false);
    expect(repair.attention).toMatch(/1 appearances require review/);
    expect(await db.game.findUniqueOrThrow({ where: { id: gameId } })).toMatchObject({ status: "MANUAL_REVIEW", configJson: null, readyAt: null });
    await expect(publishGame(c, gameId, { type: "ADMIN", id: "synthetic-admin" })).rejects.toThrow("not completely approved and ready");
    expect(await db.targetVariantAsset.count({ where: { targetInstance: { gameScene: { gameId } }, status: "GENERATED" } })).toBe(26);
    const calls = w.calls.length;
    expect(calls).toBe(58);
    for (let i = 0; i < 3; i++) expect(await runLocalPatchWorldSlice(c, w.deps, gameId)).toMatchObject({ claimed: false, pending: false });
    expect(w.calls).toHaveLength(calls);
    expect(w.calls.some(call => call.endsWith(":render:4"))).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  }, 240_000);

  it("publishes all 27 only when the single final repair passes and never repaints the other 26", async () => {
    const { gameId } = await seed("player-repaired"), hide = WORLD_LOCAL_PATCH_HIDES[0]!.hides[0]!;
    const w = worker(gameId, hide.id, 2);
    const sentBefore = sendMail.mock.calls.length;
    const first = await runLocalPatchWorldSlice(c, w.deps, gameId, { maxHides: 27 });
    expect(first.pending).toBe(true);
    expect(first.outcomes).toHaveLength(27);
    const second = await runLocalPatchWorldSlice(c, w.deps, gameId, { maxHides: 27 });
    expect(second.outcomes).toHaveLength(1);
    expect(second.outcomes[0]).toMatchObject({ hideId: hide.id, attempt: 2, state: "gave-up" });
    expect(second.pending).toBe(true);
    expect(await db.game.findUniqueOrThrow({ where: { id: gameId } })).toMatchObject({ status: "TARGETS_GENERATING", configJson: null });

    const repair = await runLocalPatchWorldSlice(c, w.deps, gameId, { maxHides: 27 });
    expect(repair.outcomes).toHaveLength(1);
    expect(repair.outcomes[0]).toMatchObject({ hideId: hide.id, attempt: 3, state: "generated" });
    expect(repair.pending).toBe(false);
    const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.status).toBe("READY");
    const config = GameConfigSchema.parse(JSON.parse(game.configJson!));
    expect(config.scenes).toHaveLength(9);
    expect(config.scenes.flatMap(scene => scene.targets)).toHaveLength(27);
    const variants = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } }, variant: "A" } });
    expect(variants.filter(row => row.status === "GENERATED")).toHaveLength(27);
    expect(variants.filter(row => row.attempts === 1)).toHaveLength(26);
    expect(variants.filter(row => row.attempts === 3)).toHaveLength(1);
    expect(w.calls.filter(call => call.includes(":render:")).filter(call => call.startsWith(`${hide.id}:`)))
      .toEqual([1, 2, 3].map(attempt => `${hide.id}:${hide.pose}:render:${attempt}`));
    expect(w.calls).toHaveLength(58);
    expect(sendMail).toHaveBeenCalledTimes(sentBefore + 1);
    const link = await ensurePlayerLink(c, gameId);
    expect(await resolvePlayToken(c, link.token)).toMatchObject({ ok: true, game: { id: gameId, status: "READY" } });
    const settled = (await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId))).settledMicroUsd;
    for (let i = 0; i < 3; i++) expect(await runLocalPatchWorldSlice(c, w.deps, gameId)).toMatchObject({ claimed: false, pending: false });
    expect(w.calls).toHaveLength(58);
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId))).settledMicroUsd).toBe(settled);
    expect(fetch).not.toHaveBeenCalled();
  }, 240_000);

  it.each(["TWO_WORLDS", "ALL_WORLDS"])("refuses unsupported %s packages before changing a local-patch draft", async tier => {
    const { gameId } = await seed(`player-package-${tier}`);
    await db.game.update({ where: { id: gameId }, data: { status: "PHOTO_APPROVED", packageTier: null } });
    expect(await selectPackage(c, gameId, tier)).toMatchObject({ ok: false, code: "PACKAGE_UNAVAILABLE" });
    expect(await db.game.findUniqueOrThrow({ where: { id: gameId } })).toMatchObject({ status: "PHOTO_APPROVED", packageTier: null, sceneCount: 9 });
    expect(await db.gameScene.count({ where: { gameId } })).toBe(9);
    expect(fetch).not.toHaveBeenCalled();
  });
});
