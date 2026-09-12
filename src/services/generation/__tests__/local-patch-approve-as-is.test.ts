import { copyFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import type { Actor } from "../../audit.service";
import { approveAndPublish } from "../../admin.service";
import { resolvePlayToken } from "../../share-link.service";
import { WORLD_LOCAL_PATCH_HIDES, cropOf, maskOf } from "../../../domain/scene/local-patch-hides";
import { LOCAL_PATCH_SCENE_VERSION } from "../../../../content/scenes/local-patch-release";
import { GameConfigSchema } from "../../../domain/game/config";
import { LOCAL_PATCH_STYLE, runLocalPatchWorldSlice } from "../local-patch-world";
import { composeLocalPatchGame } from "../local-patch-player";
import { approveLocalPatchAsIs, LOCAL_PATCH_HUMAN_ACTION } from "../local-patch-human-approval";
import { boardWizardWorldId } from "../board-conditioned-wizard";
import type { LocalPatchHideDeps } from "../local-patch-hide";
import { bill, boardPng, paintedCrop, paintedOk, PASSING_ANSWER, reply, seedApprovedGame } from "./local-patch-fixtures";

const settings = vi.hoisted(() => ({ appEnv: "qa", testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({
  env: () => ({ APP_ENV: settings.appEnv, GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
    GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", OPENAI_API_KEY: "synthetic-never-live" }),
  spendGuard: () => ({ appEnv: settings.appEnv, realGeneration: true, testers: settings.testers }),
  flag: () => false, adminEmails: () => ["manual-admin@example.invalid"],
}));

const gameId = "manual-as-is-synthetic", admin = { type: "ADMIN", id: "manual-admin" } as const;
const hides = WORLD_LOCAL_PATCH_HIDES.flatMap(board => board.hides);
const failedHides = new Set(hides.slice(0, 7).map(hide => hide.id));
let scratch: string, template: string, db: PrismaClient, c: Container, sequence = 0;
const connect = (file: string) => new PrismaClient({ datasources: { db: { url: `file:${file.replace(/\\/g, "/")}` } } });
const container = (client: PrismaClient) => ({ db: client, storage: new DbStorage(client),
  secret: "synthetic-manual-approval", appUrl: "http://localhost:3000", adminEmails: ["manual-admin@example.invalid"],
  analytics: { track: () => {} }, email: { id: "console", send: vi.fn(async () => {}) }, emailFallbackTo: null } as unknown as Container);

beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-manual-as-is-")));
  template = path.join(scratch, "template.sqlite");
  const seedDb = connect(template), seedC = container(seedDb);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Network forbidden in manual approval tests"); }));
  await applyTestSchema(seedDb);
  try {
    const seeded = await seedApprovedGame(seedC, seedDb, { gameId, styleVersion: LOCAL_PATCH_STYLE, status: "TARGETS_GENERATING", withJob: true,
      scenes: WORLD_LOCAL_PATCH_HIDES.map(board => ({ slug: board.board, version: LOCAL_PATCH_SCENE_VERSION })) });
    settings.testers.push(seeded.email);
    await seedDb.user.create({ data: { id: admin.id, email: "manual-admin@example.invalid" } });
    await seedDb.game.update({ where: { id: gameId }, data: { paidAt: new Date() } });
    await seedDb.order.create({ data: { id: "manual-paid-order", gameId, userId: seeded.userId, paymentStatus: "PAID", paidAt: new Date(),
      amountAgorot: 5900, packageTier: "ONE_WORLD", provider: "synthetic" } });
    const avatarId = "manual-avatar", storagePath = `game/${avatarId}.png`;
    const avatar = await sharp(seeded.sheet).resize(256, 256).png().toBuffer();
    await seedC.storage.put(storagePath, avatar, "image/png");
    await seedDb.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", status: "READY", storagePath,
      mimeType: "image/png", bytes: avatar.length, width: 256, height: 256 } });
    await seedDb.childProfile.update({ where: { id: `chl-${gameId}` }, data: { avatarAssetId: avatarId } });
    const board = await boardPng(); let judgeCount = 0;
    const deps: LocalPatchHideDeps = {
      renderPolicySha256: "p".repeat(64), readBoardArt: async () => board,
      render: async ({ requestKey, stylePng }) => {
        const hide = hides.find(item => requestKey.startsWith(`${item.id}:`))!;
        const attempt = Number(requestKey.split(":").at(-1)), mask = maskOf(hide), crop = cropOf(hide);
        const png = await sharp(await paintedCrop(stylePng, hide)).composite([{
          input: { create: { width: 8, height: 8, channels: 4, background: { r: attempt * 50, g: 30, b: 180, alpha: 1 } } },
          left: mask.left - crop.left + 30, top: mask.top - crop.top + 100,
        }]).png().toBuffer();
        return paintedOk(png, bill(`req-manual-${requestKey}`));
      },
      judge: async ({ hideId }) => reply({ requestId: `req-manual-judge-${++judgeCount}`, raw: JSON.stringify(failedHides.has(hideId)
        ? { ...PASSING_ANSWER, styleMatch: "fail", verdict: "fail", reason: "Synthetic style mismatch retained for explicit human review",
          faults: [{ check: "styleMatch", where: "the child's painted face" }] }
        : PASSING_ANSWER) }),
    };
    expect((await runLocalPatchWorldSlice(seedC, deps, gameId, { maxHides: 27 })).outcomes).toHaveLength(27);
    expect((await runLocalPatchWorldSlice(seedC, deps, gameId, { maxHides: 27 })).outcomes).toHaveLength(7);
    expect(judgeCount).toBe(34);
    // The live game completed under the normal-two-attempt policy, before the
    // optional repair release. Preserve those real rows and stop its old job.
    await seedDb.game.update({ where: { id: gameId }, data: { status: "MANUAL_REVIEW", lastError: "7 retained appearances require review" } });
    await seedDb.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "DONE", currentStep: null, lastError: null } });
    expect(await seedDb.targetVariantAsset.count({ where: { status: "GENERATED" } })).toBe(20);
    expect(await seedDb.targetVariantAsset.count({ where: { status: "FAILED", attempts: 2 } })).toBe(7);
    expect(fetch).not.toHaveBeenCalled();
  } finally { await seedDb.$disconnect(); }
}, 240_000);

beforeEach(async () => {
  settings.appEnv = "qa";
  // Copy only our closed, isolated fixture DB. Each adversarial case gets all
  // actual retained render/judge/ledger rows without re-running generation.
  const filename = path.join(scratch, `case-${++sequence}.sqlite`);
  copyFileSync(template, filename); db = connect(filename); c = container(db);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Network forbidden in manual approval tests"); }));
});
afterEach(async () => { vi.restoreAllMocks(); await db.$disconnect(); vi.unstubAllGlobals(); });
afterAll(() => {
  const target = realpathSync(scratch);
  if (path.dirname(target) === realpathSync(tmpdir()) && path.basename(target).startsWith("findme-manual-as-is-")) rmSync(target, { recursive: true, force: true });
});

const rows = () => db.targetVariantAsset.findMany({ orderBy: { id: "asc" } });
async function unchanged() {
  return { game: await db.game.findUniqueOrThrow({ where: { id: gameId } }), job: await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } }),
    rows: await rows(), ledger: await db.worldBudgetLedger.findMany({ orderBy: { worldId: "asc" } }),
    audits: await db.auditLog.findMany({ where: { action: LOCAL_PATCH_HUMAN_ACTION }, orderBy: { id: "asc" } }) };
}

describe("explicit manual publication of the 20-pass / 7-failed retained world", () => {
  it("approves all27 separately, keeps every original machine judgment and bill, and publishes both player variants without generation", async () => {
    const before = await unchanged(), failed = before.rows.filter(row => row.status === "FAILED");
    const latest = new Map(failed.map(row => [row.id, JSON.parse(row.rejectedAssetIdsJson!).at(-1) as string]));
    const send = vi.fn(async () => { throw new Error("Synthetic email delivery failure must not undo READY"); });
    c.email.send = send;
    const published = await approveAndPublish(c, gameId, admin);
    const after = await unchanged();
    expect(after.game).toMatchObject({ status: "READY", readyAt: expect.any(Date), lastError: null });
    expect(send).toHaveBeenCalledOnce();
    const token = new URL(published.playUrl).pathname.split("/").at(-1)!;
    expect(await resolvePlayToken(c, token)).toMatchObject({ ok: true, game: { id: gameId, status: "READY" } });
    expect(after.job).toMatchObject({ status: "DONE", currentStep: null, attempts: before.job.attempts });
    expect(after.rows).toHaveLength(27); expect(after.rows.every(row => row.status === "APPROVED")).toBe(true);
    expect(after.rows.map(row => [row.id, row.attempts, row.costCents, row.judgeJson, row.rejectedAssetIdsJson]))
      .toEqual(before.rows.map(row => [row.id, row.attempts, row.costCents, row.judgeJson, row.rejectedAssetIdsJson]));
    expect(after.ledger).toEqual(before.ledger);
    expect(after.audits).toHaveLength(27);
    for (const audit of after.audits) {
      expect(audit).toMatchObject({ actorType: "ADMIN", actorId: admin.id, entityId: gameId });
      const decision = JSON.parse(audit.metaJson!);
      expect(decision).toMatchObject({ decision: "approve-as-is", machineVerdictUnchanged: true, gameId });
      if (latest.has(decision.variantId)) expect(decision.sourceAssetId).toBe(latest.get(decision.variantId));
    }
    for (const row of failed) {
      const source = await db.asset.findUniqueOrThrow({ where: { id: latest.get(row.id)! } });
      const published = await db.asset.findUniqueOrThrow({ where: { id: after.rows.find(item => item.id === row.id)!.assetId! } });
      expect(source).toMatchObject({ type: "REJECTED_PATCH", visibility: "PRIVATE", status: "READY" });
      expect(published).toMatchObject({ type: "TARGET_SPRITE", visibility: "GAME", costCents: 0 });
      expect(await c.storage.get(published.storagePath)).toEqual(await c.storage.get(source.storagePath));
    }
    const config = GameConfigSchema.parse(JSON.parse(after.game.configJson!));
    expect(config.scenes).toHaveLength(9);
    expect(config.scenes.flatMap(scene => scene.targets)).toHaveLength(27);
    for (const target of config.scenes.flatMap(scene => scene.targets)) {
      expect(target.sprite.kind).toBe("image");
      expect(target.spriteByVariant?.A).toEqual(target.sprite); expect(target.spriteByVariant?.B).toEqual(target.sprite);
    }
    expect((await composeLocalPatchGame(c, gameId)).scenes).toEqual(config.scenes);
    await expect(approveLocalPatchAsIs(c, gameId, admin)).rejects.toThrow();
    expect((await unchanged()).ledger).toEqual(before.ledger);
    expect(fetch).not.toHaveBeenCalled();
  }, 60_000);

  it.each(["non-admin", "unlisted-admin", "production", "active-job", "tampered-rejected", "tampered-generated", "tampered-identity", "missing-geometry"])("refuses %s before publication and without changing decisions, attempts or billing", async defect => {
    let actor: Actor = admin;
    if (defect === "non-admin") actor = { type: "USER", id: `usr-${gameId}` };
    if (defect === "unlisted-admin") actor = { type: "ADMIN", id: `usr-${gameId}` };
    if (defect === "production") settings.appEnv = "production";
    if (defect === "active-job") await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "RUNNING" } });
    if (defect === "tampered-rejected" || defect === "tampered-generated") {
      const row = await db.targetVariantAsset.findFirstOrThrow({ where: { status: defect === "tampered-rejected" ? "FAILED" : "GENERATED" } });
      const assetId = defect === "tampered-rejected" ? JSON.parse(row.rejectedAssetIdsJson!).at(-1) : row.assetId;
      const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
      const png = await sharp(await c.storage.get(asset.storagePath)).negate().png().toBuffer();
      await c.storage.put(asset.storagePath, png, "image/png");
    }
    if (defect === "tampered-identity") {
      const identity = await db.asset.findUniqueOrThrow({ where: { id: `ast-sheet-${gameId}` } });
      await c.storage.put(identity.storagePath, await sharp(await c.storage.get(identity.storagePath)).negate().png().toBuffer(), "image/png");
    }
    if (defect === "missing-geometry") {
      const row = await db.targetVariantAsset.findFirstOrThrow({ where: { status: "GENERATED" } });
      await db.targetVariantAsset.update({ where: { id: row.id }, data: { rectJson: null } });
    }
    const before = await unchanged();
    await expect(approveLocalPatchAsIs(c, gameId, actor)).rejects.toThrow();
    expect(await unchanged()).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  }, 60_000);

  it("rejects changed approved pixels, tap geometry, identity or machine receipt on later composition", async () => {
    await approveLocalPatchAsIs(c, gameId, admin);
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: boardWizardWorldId(gameId) } });
    const row = await db.targetVariantAsset.findFirstOrThrow({ where: { assetId: { startsWith: "ast_lpha_" } } });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: row.assetId! } }), original = await c.storage.get(asset.storagePath);
    await c.storage.put(asset.storagePath, await sharp(original).negate().png().toBuffer(), "image/png");
    await expect(composeLocalPatchGame(c, gameId)).rejects.toThrow();
    await c.storage.put(asset.storagePath, original, "image/png");
    await db.targetVariantAsset.update({ where: { id: row.id }, data: { hitRectJson: JSON.stringify({ x: .01, y: .01, w: .02, h: .02 }) } });
    await expect(composeLocalPatchGame(c, gameId)).rejects.toThrow();
    await db.targetVariantAsset.update({ where: { id: row.id }, data: { hitRectJson: row.hitRectJson } });
    const identity = await db.asset.findUniqueOrThrow({ where: { id: `ast-sheet-${gameId}` } }), originalIdentity = await c.storage.get(identity.storagePath);
    await c.storage.put(identity.storagePath, await sharp(originalIdentity).negate().png().toBuffer(), "image/png");
    await expect(composeLocalPatchGame(c, gameId)).rejects.toThrow();
    await c.storage.put(identity.storagePath, originalIdentity, "image/png");
    await db.targetVariantAsset.update({ where: { id: row.id }, data: { judgeJson: JSON.stringify({ verdict: { verdict: "pass" } }) } });
    await expect(composeLocalPatchGame(c, gameId)).rejects.toThrow();
    await db.targetVariantAsset.update({ where: { id: row.id }, data: { judgeJson: row.judgeJson } });
    expect((await composeLocalPatchGame(c, gameId)).scenes).toHaveLength(9);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: boardWizardWorldId(gameId) } })).toEqual(ledger);
    expect(fetch).not.toHaveBeenCalled();
  }, 60_000);

  it("resumes after human decisions commit but final publication is interrupted, keeping the same27 decisions and source images", async () => {
    const before = await unchanged();
    await db.$executeRawUnsafe("CREATE TRIGGER interrupt_manual_ready BEFORE UPDATE OF status ON Game WHEN NEW.status='READY' BEGIN SELECT RAISE(ABORT,'synthetic interruption before ready'); END");
    try { await expect(approveLocalPatchAsIs(c, gameId, admin)).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER interrupt_manual_ready"); }
    const interrupted = await unchanged();
    expect(interrupted.game).toMatchObject({ status: "MANUAL_REVIEW", configJson: null, readyAt: null });
    expect(interrupted.audits).toHaveLength(27); expect(interrupted.rows.every(row => row.status === "APPROVED")).toBe(true);
    expect(interrupted.ledger).toEqual(before.ledger);
    const assets = await db.asset.findMany({ where: { provider: "local-patch" }, orderBy: { id: "asc" } });
    await approveLocalPatchAsIs(c, gameId, admin);
    const finished = await unchanged();
    expect(finished.game.status).toBe("READY");
    expect(finished.audits).toEqual(interrupted.audits);
    expect(finished.ledger).toEqual(before.ledger);
    expect(finished.rows.map(row => [row.id, row.assetId, row.judgeJson, row.attempts, row.costCents]))
      .toEqual(interrupted.rows.map(row => [row.id, row.assetId, row.judgeJson, row.attempts, row.costCents]));
    expect(await db.asset.findMany({ where: { provider: "local-patch" }, orderBy: { id: "asc" } })).toEqual(assets);
    expect((await composeLocalPatchGame(c, gameId)).scenes.flatMap(scene => scene.targets)).toHaveLength(27);
    expect(fetch).not.toHaveBeenCalled();
  }, 60_000);
});
