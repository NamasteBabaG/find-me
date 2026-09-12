import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import { DbStorage } from "../../infra/storage/db";
import type { EmailMessage } from "../../infra/email/types";
import type { Container } from "../container";
import { composeGame, composeScene } from "../../domain/game/compose";
import { GameConfigSchema } from "../../domain/game/config";
import { localPatchBoardsForVersion } from "../../domain/scene/local-patch-catalog";
import { sceneBySlug } from "../scene-catalog.service";
import { seedApprovedGame } from "../generation/__tests__/local-patch-fixtures";
import { enqueueLocalPatchNotifications, deliverLocalPatchNotifications, localPatchConcerns, localPatchNotificationPrefix } from "../local-patch-notifications";
import { deleteLocalPatchGame } from "../generation/local-patch-deletion";
import { hasLocalPatchPublicationPolicy, recordLocalPatchPublicationPolicy, type LocalPatchPublicationBinding } from "../generation/local-patch-publication-policy";
import { ResendEmailProvider } from "../../infra/email/resend";
import { MockAvatarProvider, NoopFaceDetector } from "../../infra/generation/mock";
import { NoPatchJudge } from "../../infra/generation/judge";
import { MockPaymentProvider } from "../../infra/payment/mock";
import { InlineJobRunner } from "../../infra/jobs/inline";
import { NoopAnalytics } from "../../infra/analytics/console";
import { JUDGE_CHECKS, localPatchVerdictSchema } from "../generation/local-patch-judge";
import { rotatePlayerLink } from "../share-link.service";
import { gameReadyEmail } from "../email/templates";
import { generationCostCents, generationCostForDisplay, localPatchCostForDisplay, recutAvatar } from "../admin.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "../generation/board-conditioned-wizard";
import { bill } from "../generation/__tests__/local-patch-fixtures";

vi.mock("../../lib/env", () => ({
  env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0 }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: [] }), flag: () => false, adminEmails: () => [],
}));

let scratch: string, db: PrismaClient, c: Container;
beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-advisory-mail-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "mail.sqlite").split(path.sep).join("/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), secret: "synthetic-mail-secret", appUrl: "https://qa.example.invalid",
    email: { id: "resend", send: async () => ({ id: "synthetic-mail" }) }, adminEmails: ["admin@example.invalid"],
    analytics: new NoopAnalytics(), avatars: new MockAvatarProvider(), faces: new NoopFaceDetector(),
    judge: new NoPatchJudge(), payment: new MockPaymentProvider("https://qa.example.invalid", "test-secret"), jobs: new InlineJobRunner() };
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No network in notification tests"); }));
});
afterAll(async () => {
  vi.unstubAllGlobals(); vi.restoreAllMocks(); await db.$disconnect();
  const target = path.resolve(scratch);
  if (path.dirname(target) === realpathSync(tmpdir()) && path.basename(target).startsWith("findme-advisory-mail-")) rmSync(target, { recursive: true, force: true });
});

async function seed(gameId: string, avatarId = "synthetic-avatar") {
  const boards = localPatchBoardsForVersion(7);
  const original = await seedApprovedGame(c, db, { gameId, status: "READY", styleVersion: "local-patch-world-v1",
    scenes: boards.map(board => ({ slug: board.board, version: 7 })) });
  const child = { name: "Yuval", avatarUrl: `/api/assets/${avatarId}` };
  const scenes = boards.map(board => {
    const def = sceneBySlug(board.board, 7);
    const composed = composeScene(def, child, def.targets.map(target => ({ targetId: target.id,
      sprite: { kind: "image" as const, url: `/api/assets/${gameId}-${target.id}`, width: 512, height: 768 } })), "he");
    return { ...composed, playMode: "find-any" as const, appearancesPerBoard: 5 as const, findsRequiredToAdvance: 3 as const };
  });
  const config = GameConfigSchema.parse(composeGame({ gameId, child, scenes, locale: "he", styleVersion: "local-patch-world-v1", packageTier: "ONE_WORLD" }));
  await db.game.update({ where: { id: gameId }, data: { configJson: JSON.stringify(config), readyAt: new Date() } });
  let index = 0;
  for (const board of boards) for (const hide of board.hides) {
    const id = `${gameId}-${index++}`;
    await db.asset.create({ data: { id: `ast-${id}`, ownerId: original.userId, type: "TARGET_SPRITE", visibility: "GAME", status: "READY",
      storagePath: `game/ast-${id}.png`, mimeType: "image/png", bytes: original.sheet.length, width: 512, height: 768,
      provider: "local-patch", providerRequestId: gameId } });
    await c.storage.put(`game/ast-${id}.png`, original.sheet, "image/png");
    await db.targetInstance.create({ data: { id: `tgt-${id}`, gameSceneId: `gsc-${gameId}-${board.board}`, targetId: hide.targetId,
      spriteKind: "image", targetType: "child", slotAId: `${hide.targetId}-a`, slotBId: `${hide.targetId}-b`,
      variants: { create: { id: `tva-${id}`, variant: "A", slotId: `${hide.targetId}-a`, status: "GENERATED", assetId: `ast-${id}`, provider: "local-patch",
        attempts: 1, judgeJson: JSON.stringify({ hide: hide.id, verdict: index <= 2 ? { verdict: index === 1 ? "fail" : "unsure", reason: "Looks too realistic <not HTML>", faults: ["one", "two"] } : { verdict: "pass", reason: "Fine" } }) } } } });
  }
  await db.$transaction(tx => enqueueLocalPatchNotifications(c, tx, gameId, config));
  return { ...original, config };
}

describe("advisory notification outbox", () => {
  it.each(["failed", "leased"])("preserves immutable ready/report delivery through display repair when notices are %s", async state => {
    const gameId = `avatar-notice-${state}`, avatarId = `${gameId}-old-avatar`, item = await seed(gameId, avatarId);
    await db.asset.create({ data: { id: avatarId, ownerId: item.userId, type: "AVATAR", visibility: "GAME", status: "READY",
      storagePath: `game/${avatarId}.png`, mimeType: "image/png", width: 1024, height: 1024, bytes: item.sheet.length } });
    await c.storage.put(`game/${avatarId}.png`, item.sheet, "image/png");
    await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { avatarAssetId: avatarId } });
    const eventsWhere = { entityId: gameId, action: "local-patch:notification-pending" };
    let now = Date.now(); const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const seen: EmailMessage[] = [];
    try {
      if (state === "failed") {
        const failure = { ...c, email: { id: "resend" as const, send: async (message: EmailMessage) => { seen.push(message); throw new Error("unconfirmed send"); } } };
        expect(await deliverLocalPatchNotifications(failure, gameId)).toEqual({ sent: 0, failed: 2 });
      } else {
        const event = await db.auditLog.findFirstOrThrow({ where: eventsWhere });
        await db.auditLog.update({ where: { id: event.id }, data: { metaJson: JSON.stringify({ ...JSON.parse(event.metaJson!), state: "sending", leaseUntil: now + 60000 }) } });
      }
      const before = await db.auditLog.findMany({ where: eventsWhere, orderBy: { id: "asc" } });
      const payloads = await db.fileBlob.findMany({ where: { key: { startsWith: localPatchNotificationPrefix(gameId) } }, orderBy: { key: "asc" } });
      const gameBefore = await db.game.findUniqueOrThrow({ where: { id: gameId } });
      if (state === "leased") {
        await expect(recutAvatar(c, gameId, { type: "ADMIN", id: "admin" })).rejects.toMatchObject({ code: "conflict" });
        expect((await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson).toBe(gameBefore.configJson);
        expect((await db.childProfile.findUniqueOrThrow({ where: { id: `chl-${gameId}` } })).avatarAssetId).toBe(avatarId);
        expect(await db.auditLog.findMany({ where: eventsWhere, orderBy: { id: "asc" } })).toEqual(before);
      } else {
        expect(await recutAvatar(c, gameId, { type: "ADMIN", id: "admin" })).toEqual({ ok: true });
        const after = await db.auditLog.findMany({ where: eventsWhere, orderBy: { id: "asc" } });
        expect(after).toHaveLength(2);
        for (let i = 0; i < before.length; i++) {
          expect(after[i]!.id).toBe(before[i]!.id);
          const oldMeta = JSON.parse(before[i]!.metaJson!), nextMeta = JSON.parse(after[i]!.metaJson!);
          expect(nextMeta.configSha256).not.toBe(oldMeta.configSha256);
          expect({ ...nextMeta, configSha256: oldMeta.configSha256 }).toEqual(oldMeta);
        }
        now += 61000;
        const successful: EmailMessage[] = [];
        const retry = { ...c, email: { id: "resend" as const, send: async (message: EmailMessage) => { successful.push(message); return { id: "confirmed" }; } } };
        expect(await deliverLocalPatchNotifications(retry, gameId)).toEqual({ sent: 2, failed: 0 });
        expect(successful).toEqual(seen); // Same bytes, recipient and provider idempotency key.
        expect((await db.game.findUniqueOrThrow({ where: { id: gameId } })).status).toBe("DELIVERED");
        expect(await deliverLocalPatchNotifications(retry, gameId)).toEqual({ sent: 0, failed: 0 });
      }
      expect(await db.fileBlob.findMany({ where: { key: { startsWith: localPatchNotificationPrefix(gameId) } }, orderBy: { key: "asc" } })).toEqual(payloads);
    } finally { clock.mockRestore(); }
  });

  it("counts every world-ledger scope once and never treats unresolved accounting as zero", async () => {
    const item = await seed("inclusive-cost"), world = boardWizardWorldId(item.gameId), budget = boardWizardBudgetOf(c);
    const before = await budget.audit(world);
    for (const scope of ["image", "judge", "identity"] as const) {
      await budget.reserve(world, { requestKey: `cost-${scope}`, operationFingerprint: `operation-${scope}`, reserveMicroUsd: 100_000, scope });
      await budget.settle(world, `cost-${scope}`, { ...bill(`cost-${scope}`, 12_345), costBasis: "conservative-upper-estimate" });
    }
    expect(await generationCostCents(c, item.gameId)).toBe((before.settledMicroUsd + 37_035) / 10_000);
    expect(await localPatchCostForDisplay(c, item.gameId)).toMatchObject({ estimated: true, unresolved: false, settledMicroUsd: before.settledMicroUsd + 37_035 });
    await budget.reserve(world, { requestKey: "uncertain-cost", operationFingerprint: "uncertain-operation", reserveMicroUsd: 50_000, scope: "judge" });
    await budget.markUnknown(world, "uncertain-cost", "provider receipt unavailable");
    expect(await generationCostForDisplay(c, item.gameId)).toBeNull();
    expect(await localPatchCostForDisplay(c, item.gameId)).toMatchObject({ unresolved: true, unknownCharges: 1, settledMicroUsd: before.settledMicroUsd + 37_035, reservedMicroUsd: 50_000 });
  });

  it("leaves events untouched when the drain deadline is exhausted or a claim stalls", async () => {
    const item = await seed("mail-deadline"), send = vi.fn(async () => ({ id: "must-not-send" }));
    const where = { entityId: item.gameId, action: "local-patch:notification-pending" };
    const before = await db.auditLog.findMany({ where, orderBy: { id: "asc" } });
    let now = Date.now(); const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const update = db.auditLog.updateMany.bind(db.auditLog);
    try {
      expect(await deliverLocalPatchNotifications({ ...c, email: { id: "resend", send } }, item.gameId, { deadlineAt: now })).toEqual({ sent: 0, failed: 0 });
      const stalledDb = new Proxy(db, { get(target, property, receiver) {
        if (property !== "auditLog") return Reflect.get(target, property, receiver);
        return new Proxy(target.auditLog, { get(delegate, key, delegateReceiver) {
          if (key !== "updateMany") return Reflect.get(delegate, key, delegateReceiver);
          return async (args: Parameters<typeof update>[0]) => {
            const result = await update(args);
            if (typeof args.data.metaJson === "string" && args.data.metaJson.includes('"state":"sending"')) now += 20_000;
            return result;
          };
        } });
      } });
      await deliverLocalPatchNotifications({ ...c, db: stalledDb, email: { id: "resend", send } }, item.gameId, { deadlineAt: now + 20_000 });
      expect(send).not.toHaveBeenCalled();
      expect(await db.auditLog.findMany({ where, orderBy: { id: "asc" } })).toEqual(before);
    } finally { clock.mockRestore(); }
  });

  it("passes one bounded window through delivery and leaves later events pending", async () => {
    const item = await seed("mail-bounded"), seen: number[] = [];
    let now = Date.now(); const start = now, clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const send = vi.fn(async (_mail: EmailMessage, options?: { deadlineAt?: number }) => {
      seen.push(options!.deadlineAt!); now += 17_000; return { id: "first-only" };
    });
    try {
      expect(await deliverLocalPatchNotifications({ ...c, email: { id: "resend", send } }, item.gameId)).toEqual({ sent: 1, failed: 0 });
      expect(seen).toEqual([start + 17_000]);
      expect(await db.auditLog.count({ where: { entityId: item.gameId, action: "local-patch:notification-pending" } })).toBe(1);
    } finally { clock.mockRestore(); }
  });

  it("bounds the real email transport through a stalled response body", async () => {
    const wire = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"id":'));
      init!.signal!.addEventListener("abort", () => controller.error(new Error("deadline-aborted")), { once: true });
    } }), { status: 200 }));
    vi.stubGlobal("fetch", wire);
    try {
      const mail = { to: "parent@example.invalid", subject: "test", html: "test", text: "test", tag: "game-ready" as const };
      const provider = new ResendEmailProvider("synthetic-never-real", "test@example.invalid");
      await expect(provider.send(mail, { deadlineAt: Date.now() - 1 })).rejects.toThrow("deadline exhausted");
      expect(wire).not.toHaveBeenCalled();
      const start = Date.now();
      await expect(provider.send(mail, { deadlineAt: start + 100 })).rejects.toThrow("deadline-aborted");
      expect(Date.now() - start).toBeLessThan(1_000);
    } finally { vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No network"); })); }
  });
  it.each(["en", "he"] as const)("explains five/any-three only for the new ready email (%s)", locale => {
    const input = { to: "parent@example.invalid", childName: "Yuval", playLink: "https://qa.example.invalid/play/token", sceneCount: 9, locale };
    const next = gameReadyEmail({ ...input, playMode: "find-any" }), legacy = gameReadyEmail(input);
    const five = locale === "he" ? "חמישה מחבואים" : "five hiding spots";
    const three = locale === "he" ? "שלושה מחבואים" : "three hiding spots";
    expect(next.html).toContain(five); expect(next.text).toContain(five);
    expect(legacy.html).toContain(three); expect(legacy.html).not.toContain(five);
  });
  it("counts each current hide once, not its fault count or history", () => {
    const row = { assetId: "asset", board: "paris", targetId: "t", judgeJson: JSON.stringify({ hide: "paris-1", verdict: { verdict: "fail", reason: "cropped", faults: [1, 2, 3] } }) };
    expect(localPatchConcerns([row, row])).toHaveLength(1);
    expect(localPatchConcerns([{ ...row, judgeJson: "broken" }])[0]?.uncertainty).toBe(true);
  });

  it.each(["fail", "unsure"])("reports a raw %s even when all green fields derive a pass", verdict => {
    const parsed = localPatchVerdictSchema.parse({ ...Object.fromEntries(JUDGE_CHECKS.map(check => [check, "pass"])), verdict,
      reason: "Overall looks too photographic", faults: [] });
    expect(parsed.verdict).toBe("pass");
    const rows = [{ assetId: "asset", board: "paris", targetId: "t", judgeJson: JSON.stringify({ hide: "paris-1", verdict: parsed }) }];
    expect(localPatchConcerns(rows)).toEqual([{ board: "paris", hide: "paris-1", targetId: "t", uncertainty: true, reason: "Overall looks too photographic" }]);
  });

  it("reports a non-blocking uncertain check even with a derived and claimed pass", () => {
    const parsed = localPatchVerdictSchema.parse({ ...Object.fromEntries(JUDGE_CHECKS.map(check => [check, "pass"])), scaleRight: "unsure", verdict: "pass",
      reason: "Perspective makes the scale unclear", faults: [] });
    expect(parsed.verdict).toBe("pass");
    expect(localPatchConcerns([{ assetId: "asset", board: "paris", targetId: "t", judgeJson: JSON.stringify({ verdict: parsed }) }])).toHaveLength(1);
  });

  it("sends independent ready/report messages once and keeps the raw visual failures", async () => {
    const item = await seed("mail-success"), sent: EmailMessage[] = [];
    const send = vi.fn(async (message: EmailMessage) => { sent.push(message); return { id: `mail-${sent.length}` }; });
    const fresh = { ...c, email: { id: "resend" as const, send } };
    const before = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId: item.gameId } } }, select: { id: true, judgeJson: true } });
    expect(await deliverLocalPatchNotifications(fresh, item.gameId)).toEqual({ sent: 2, failed: 0 });
    expect(sent.map(message => message.tag).sort()).toEqual(["admin-alert", "game-ready"]);
    expect(sent.find(message => message.tag === "admin-alert")?.subject).toContain("2 מחבואים");
    expect(sent.find(message => message.tag === "admin-alert")?.html).toContain("&lt;not HTML&gt;");
    expect(sent.find(message => message.tag === "admin-alert")?.html).toContain("#hide-");
    await db.$transaction(tx => enqueueLocalPatchNotifications(c, tx, item.gameId, item.config));
    await deliverLocalPatchNotifications({ ...fresh }, item.gameId);
    expect(send).toHaveBeenCalledTimes(2);
    expect((await db.game.findUniqueOrThrow({ where: { id: item.gameId } })).status).toBe("DELIVERED");
    expect(await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId: item.gameId } } }, select: { id: true, judgeJson: true } })).toEqual(before);
  });

  it("reuses the exact body/key after lost acknowledgement, while the other mail succeeds", async () => {
    const item = await seed("mail-lost-ack"), requests: EmailMessage[] = [], delivered = new Map<string, string>();
    let now = Date.now(), lose = true;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const provider = { id: "resend" as const, send: async (message: EmailMessage) => {
      requests.push(message); const key = message.idempotencyKey!;
      if (!delivered.has(key)) delivered.set(key, `mail-${delivered.size}`);
      if (message.tag === "game-ready" && lose) { lose = false; throw new Error("provider accepted, acknowledgement lost"); }
      return { id: delivered.get(key)! };
    } };
    try {
      expect(await deliverLocalPatchNotifications({ ...c, email: provider }, item.gameId)).toEqual({ sent: 1, failed: 1 });
      expect((await db.game.findUniqueOrThrow({ where: { id: item.gameId } })).status).toBe("READY");
      now += 120_000;
      expect(await deliverLocalPatchNotifications({ ...c, email: provider }, item.gameId)).toEqual({ sent: 1, failed: 0 });
      expect(delivered.size).toBe(2);
      const ready = requests.filter(message => message.tag === "game-ready");
      expect(ready).toHaveLength(2); expect(ready[1]).toEqual(ready[0]);
    } finally { clock.mockRestore(); }
  });

  it("does not retry an uncertain delivery beyond the provider deduplication window", async () => {
    const item = await seed("mail-expired"), send = vi.fn(async () => { throw new Error("No acknowledgement"); });
    let now = Date.now(); const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      await deliverLocalPatchNotifications({ ...c, email: { id: "resend", send } }, item.gameId);
      now += 24 * 60 * 60 * 1000;
      await deliverLocalPatchNotifications({ ...c, email: { id: "resend", send } }, item.gameId);
      expect(send).toHaveBeenCalledTimes(2);
      expect(await db.auditLog.count({ where: { entityId: item.gameId, action: "local-patch:notification-unknown" } })).toBe(2);
      expect((await db.game.findUniqueOrThrow({ where: { id: item.gameId } })).status).toBe("READY");
    } finally { clock.mockRestore(); }
  });

  it("deletion purges pending private email payloads and cancels delivery", async () => {
    const item = await seed("mail-deleted"), send = vi.fn(async () => ({ id: "must-not-send" }));
    expect(await db.fileBlob.count({ where: { key: { startsWith: localPatchNotificationPrefix(item.gameId) } } })).toBe(2);
    await deleteLocalPatchGame(c, item.gameId, { type: "USER", id: item.userId }, item.userId);
    expect(await db.fileBlob.count({ where: { key: { startsWith: localPatchNotificationPrefix(item.gameId) } } })).toBe(0);
    await deliverLocalPatchNotifications({ ...c, email: { id: "resend", send } }, item.gameId);
    expect(send).not.toHaveBeenCalled();
  });

  it("does not mail an administrator whose access was removed", async () => {
    const item = await seed("mail-admin-removed"), send = vi.fn(async (_message: EmailMessage) => ({ id: "ready-only" }));
    await deliverLocalPatchNotifications({ ...c, adminEmails: [], email: { id: "resend", send } }, item.gameId);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ tag: "game-ready" });
  });

  it("never sends a revoked ready link or calls it delivered; the independent report still sends", async () => {
    const item = await seed("mail-link-rotated"), send = vi.fn(async (_message: EmailMessage) => ({ id: "report-only" }));
    await rotatePlayerLink(c, item.gameId, { type: "USER", id: item.userId });
    await deliverLocalPatchNotifications({ ...c, email: { id: "resend", send } }, item.gameId);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ tag: "admin-alert" });
    expect((await db.game.findUniqueOrThrow({ where: { id: item.gameId } })).status).toBe("READY");
    expect(await db.auditLog.count({ where: { entityId: item.gameId, action: "local-patch:notification-cancelled" } })).toBe(1);
  });

  it("binds system publication to current pixels, geometry, identity and raw findings without human approval", async () => {
    const binding: LocalPatchPublicationBinding = { gameId: "binding", sceneVersion: 7, hideId: "paris-1", variantId: "variant", attempts: 1,
      identityAssetId: "identity", identitySha256: "a".repeat(64), assetId: "asset", imageSha256: "b".repeat(64), geometrySha256: "c".repeat(64), judgeJson: '{"verdict":"fail"}' };
    await db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, binding));
    expect(await hasLocalPatchPublicationPolicy(c, binding)).toBe(true);
    for (const changed of [{ imageSha256: "changed" }, { geometrySha256: "changed" }, { identitySha256: "changed" }, { judgeJson: '{"verdict":"pass"}' }, { sceneVersion: 6 }]) {
      expect(await hasLocalPatchPublicationPolicy(c, { ...binding, ...changed })).toBe(false);
    }
    await expect(db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, { ...binding, judgeJson: "changed" }))).rejects.toThrow("binding changed");
    expect(await db.auditLog.count({ where: { entityId: "binding", actorType: "ADMIN" } })).toBe(0);
  });

  it("sends the stable delivery key to Resend, without including it in the body", async () => {
    const wire = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ id: "wire-id" }), { status: 200 }));
    vi.stubGlobal("fetch", wire);
    try {
      await new ResendEmailProvider("synthetic-never-real", "test@example.invalid").send({ to: "parent@example.invalid", subject: "ready", text: "ready", html: "ready", tag: "game-ready", idempotencyKey: "logical-delivery" });
      const init = wire.mock.calls[0]?.[1] as RequestInit;
      expect(init.headers).toMatchObject({ "Idempotency-Key": "logical-delivery" });
      expect(init.body).not.toContain("logical-delivery");
    } finally { vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No network"); })); }
  });
});
