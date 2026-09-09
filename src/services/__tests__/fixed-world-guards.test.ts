import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Container } from "../container";
import type { WorldBudgetSnapshot } from "../generation/world-budget";

const calls = vi.hoisted(() => ({
  approve: vi.fn(), remove: vi.fn(), link: vi.fn(), revoke: vi.fn(), audit: vi.fn(),
  readAsset: vi.fn(), storeAsset: vi.fn(), deleteAsset: vi.fn(), cutAvatar: vi.fn(), budgetRead: vi.fn(),
  transition: vi.fn(), magicLink: vi.fn(),
}));
vi.mock("../generation/fixed-world-staging", () => ({ approveFixedWorldForPublication: calls.approve, deleteFixedWorldGame: calls.remove }));
vi.mock("../share-link.service", () => ({ ensurePlayerLink: calls.link, revokePlayerLinks: calls.revoke }));
vi.mock("../audit.service", () => ({ SYSTEM: { type: "SYSTEM" }, audit: calls.audit }));
vi.mock("../asset.service", () => ({ readAssetBuffer: calls.readAsset, storeAsset: calls.storeAsset, deleteAsset: calls.deleteAsset, signedAssetUrl: (_c: unknown, id: string) => `/api/assets/${id}` }));
vi.mock("@/infra/generation/avatar-cut", () => ({ AVATAR_SIZE: 256, avatarFromSheet: calls.cutAvatar }));
vi.mock("@/infra/db/prisma-world-budget-store", () => ({ PrismaWorldBudgetStore: class { read = calls.budgetRead; } }));
vi.mock("../game-status", async importOriginal => ({ ...await importOriginal<typeof import("../game-status")>(), transitionGame: calls.transition }));
vi.mock("../auth.service", () => ({ createMagicLink: calls.magicLink }));
vi.mock("@/lib/env", () => ({
  env: () => ({ GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 10_000 }),
  flag: () => true,
  spendGuard: () => ({ appEnv: "development", realGeneration: false }),
}));

import { runGenerationPipeline } from "../generation/pipeline";
import { composeGameConfig, persistGameConfig } from "../generation/scene-composer";
import { adjustTarget, costDashboard, generationCostCents, generationCostForDisplay, markTargetForRegeneration, orderDetailForAdmin, recutAvatar, requestNewPhoto, retryGeneration } from "../admin.service";
import { deliverGameMail, publishGame } from "../publish.service";
import { deleteGame, updateGift } from "../game.service";
import { fixedWorldJsonSha256 } from "../generation/fixed-world-materializer";
import { FIXED_WORLD_STYLE_VERSION, fixedWorldConfigSha256, fixedWorldStageRecordSchema } from "../generation/fixed-world-stage-record";
import { composeGame, composeScene } from "@/domain/game/compose";
import { sceneBySlug } from "../scene-catalog.service";

const actor = { type: "ADMIN", id: "admin" } as const;
const now = new Date("2026-09-08T00:00:00.000Z");
function game(styleVersion = FIXED_WORLD_STYLE_VERSION, status = "MANUAL_REVIEW") {
  return { id: "game", styleVersion, status, ownerId: "owner", childProfileId: "child", deletedAt: null, updatedAt: now,
    childProfile: { id: "child", ownerId: "owner", displayName: "Child", avatarAssetId: "avatar", identityAssetId: "identity", originalPhotoAssetId: "photo", retainOriginalPhoto: false },
    owner: { id: "owner", email: "owner@example.test" }, locale: "en", scenes: [], configJson: null as string | null, lastError: "original error" };
}
function setup(row = game()) {
  const db = {
    game: { findUnique: vi.fn().mockResolvedValue(row), findUniqueOrThrow: vi.fn().mockResolvedValue(row), findFirst: vi.fn().mockResolvedValue(row), findMany: vi.fn().mockResolvedValue([row]), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    generationJob: { findUnique: vi.fn().mockResolvedValue({ id: "job_game", gameId: "game", status: "DONE", stepsJson: "{}" }), create: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    childProfile: { findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    targetInstance: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "target", gameSceneId: "scene", gameScene: { gameId: "game" } }), update: vi.fn() },
    targetVariantAsset: { updateMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]), aggregate: vi.fn().mockResolvedValue({ _sum: { costCents: 0 } }) },
    gameScene: { update: vi.fn() },
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
    asset: { findUnique: vi.fn().mockResolvedValue({ id: "identity", status: "READY", width: 1024, height: 1024 }), findUniqueOrThrow: vi.fn(), findMany: vi.fn().mockResolvedValue([]), aggregate: vi.fn().mockResolvedValue({ _sum: { costCents: 0 } }) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((work: (tx: typeof db) => Promise<unknown>) => work(db));
  const extras = { jobs: { enqueue: vi.fn() }, avatars: { createAvatar: vi.fn(), createCharacter: vi.fn(), createTargetSprite: vi.fn() },
    email: { id: "console", send: vi.fn() }, analytics: { track: vi.fn() }, autoApprove: true, deliverWithProblems: true };
  return { db, ...extras, c: { db, ...extras } as unknown as Container };
}
beforeEach(() => {
  vi.clearAllMocks();
  calls.approve.mockReset().mockResolvedValue(undefined);
  calls.remove.mockReset().mockResolvedValue(true);
  calls.link.mockReset().mockResolvedValue({ id: "share", token: "token", url: "https://example.test/play/token" });
  calls.budgetRead.mockReset();
  calls.readAsset.mockResolvedValue(Buffer.from("mock image"));
  calls.cutAvatar.mockResolvedValue(Buffer.from("mock cut"));
  calls.storeAsset.mockResolvedValue({ id: "new-avatar" });
  calls.deleteAsset.mockResolvedValue(undefined);
  calls.magicLink.mockResolvedValue("https://example.test/magic");
});

describe("fixed-world legacy generation guards (no providers or database)", () => {
  it.each([FIXED_WORLD_STYLE_VERSION, "fixed-sprite-v999"])("does no costly work for marked %s games even with auto flags", async style => {
    const s = setup(game(style, "PAID"));
    await runGenerationPipeline(s.c, "game");
    expect(s.db.asset.aggregate).not.toHaveBeenCalled();
    expect(s.db.generationJob.findUnique).not.toHaveBeenCalled();
    expect(s.db.game.update).not.toHaveBeenCalled();
    expect(s.avatars.createCharacter).not.toHaveBeenCalled();
    expect(calls.approve).not.toHaveBeenCalled();
  });

  it("rechecks after a stale legacy lease claim without rewriting fixed steps", async () => {
    const legacy = game("collage-v1", "PAID"), s = setup(legacy);
    s.db.game.findUnique.mockResolvedValueOnce(legacy).mockResolvedValueOnce(game());
    s.db.generationJob.findUnique.mockResolvedValue({ id: "job_game", gameId: "game", status: "DONE", stepsJson: '{"fixedWorld":"untouched-capsule"}' });
    await runGenerationPipeline(s.c, "game");
    expect(s.db.generationJob.updateMany).toHaveBeenCalledTimes(2);
    expect(s.db.generationJob.updateMany).toHaveBeenLastCalledWith({ where: { id: "job_game", status: "RUNNING" }, data: { status: "DONE", currentStep: null } });
    expect(s.db.generationJob.update).not.toHaveBeenCalled();
    expect(s.db.game.update).not.toHaveBeenCalled();
    expect(s.db.childProfile.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(s.avatars.createCharacter).not.toHaveBeenCalled();
  });

  it.each([composeGameConfig, persistGameConfig])("rejects legacy composition before resolving assets or writing configs", async compose => {
    const s = setup();
    await expect(compose(s.c, "game")).rejects.toMatchObject({ code: "unsupported" });
    expect(s.db.asset.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(s.db.game.update).not.toHaveBeenCalled();
    expect(s.db.gameScene.update).not.toHaveBeenCalled();
  });

  it.each([
    ["adjust", (c: Container) => adjustTarget(c, "target", { dx: 0.01, dy: 0, scale: 1 }, actor)],
    ["target regeneration", (c: Container) => markTargetForRegeneration(c, "target", actor)],
    ["retry", (c: Container) => retryGeneration(c, "game", actor)],
    ["new photo", (c: Container) => requestNewPhoto(c, "game", actor, "new photo")],
    ["avatar recut", (c: Container) => recutAvatar(c, "game", actor)],
  ] as const)("rejects fixed %s before any mutation", async (_name, act) => {
    const s = setup();
    await expect(act(s.c)).rejects.toMatchObject({ code: "unsupported" });
    expect(s.db.targetInstance.update).not.toHaveBeenCalled();
    expect(s.db.targetVariantAsset.updateMany).not.toHaveBeenCalled();
    expect(s.db.game.update).not.toHaveBeenCalled();
    expect(s.db.childProfile.update).not.toHaveBeenCalled();
    expect(s.jobs.enqueue).not.toHaveBeenCalled();
    expect(calls.audit).not.toHaveBeenCalled();
    expect(calls.storeAsset).not.toHaveBeenCalled();
  });

  it.each(["recut", "photo"])("blocks %s through a legacy sibling sharing a fixed child", async operation => {
    const s = setup(game("collage-v1"));
    s.db.game.findMany.mockResolvedValue([game("collage-v1"), game()]);
    const result = operation === "recut" ? recutAvatar(s.c, "game", actor) : requestNewPhoto(s.c, "game", actor, "new");
    await expect(result).rejects.toMatchObject({ code: "unsupported" });
    expect(calls.readAsset).not.toHaveBeenCalled();
    expect(s.db.game.update).not.toHaveBeenCalled();
  });

  it("recut rechecks siblings inside the transaction and only cleans up its unattached new asset", async () => {
    const s = setup(game("collage-v1"));
    s.db.game.findMany.mockResolvedValueOnce([game("collage-v1")]).mockResolvedValueOnce([game()]);
    await expect(recutAvatar(s.c, "game", actor)).rejects.toMatchObject({ code: "unsupported" });
    expect(s.db.childProfile.updateMany).not.toHaveBeenCalled();
    expect(s.db.game.update).not.toHaveBeenCalled();
    expect(calls.deleteAsset).toHaveBeenCalledExactlyOnceWith(s.c, "new-avatar");
  });

  it("does not change shared identity when the recut Game fence is lost", async () => {
    const s = setup(game("collage-v1"));
    s.db.game.updateMany.mockResolvedValue({ count: 0 });
    await expect(recutAvatar(s.c, "game", actor)).rejects.toMatchObject({ code: "conflict" });
    expect(s.db.childProfile.updateMany).not.toHaveBeenCalled();
    expect(calls.deleteAsset).toHaveBeenCalledExactlyOnceWith(s.c, "new-avatar");
  });

  it("retains legacy recut behavior after transactional sibling and child fencing", async () => {
    const s = setup(game("collage-v1"));
    await expect(recutAvatar(s.c, "game", actor)).resolves.toEqual({ ok: true });
    expect(s.db.childProfile.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ avatarAssetId: "avatar", identityAssetId: "identity" }), data: { avatarAssetId: "new-avatar" } }));
    expect(calls.deleteAsset).toHaveBeenCalledExactlyOnceWith(s.c, "avatar");
  });

  it("retains the new avatar if a transaction commits but its acknowledgement is lost", async () => {
    const s = setup(game("collage-v1"));
    s.db.$transaction.mockImplementation(async (work: (tx: typeof s.db) => Promise<unknown>) => {
      await work(s.db);
      throw new Error("commit acknowledgement unavailable");
    });
    await expect(recutAvatar(s.c, "game", actor)).rejects.toThrow("commit acknowledgement unavailable");
    expect(s.db.childProfile.updateMany).toHaveBeenCalledOnce();
    expect(calls.deleteAsset).not.toHaveBeenCalled();
  });
});

describe("fixed-world publication, deletion and mutable gift routing", () => {
  it("routes manual publication through the strict helper before link or legacy privacy changes", async () => {
    const s = setup();
    calls.approve.mockRejectedValue(new Error("invalid capsule or unknown budget"));
    await expect(publishGame(s.c, "game", actor)).rejects.toThrow("invalid capsule");
    expect(calls.approve).toHaveBeenCalledExactlyOnceWith(s.c, "game", actor);
    expect(calls.link).not.toHaveBeenCalled();
    expect(calls.transition).not.toHaveBeenCalled();
    expect(calls.deleteAsset).not.toHaveBeenCalled();
    expect(s.email.send).not.toHaveBeenCalled();
  });

  it("does not let SYSTEM or automatic flags skip fixed approval", async () => {
    const s = setup();
    calls.approve.mockImplementation(async (_c, _id, reviewer) => { if (reviewer.type !== "ADMIN") throw new Error("manual ADMIN required"); });
    await expect(publishGame(s.c, "game", { type: "SYSTEM" })).rejects.toThrow("manual ADMIN");
    expect(calls.link).not.toHaveBeenCalled();
  });

  it("delivers only after the helper has made the fixed world READY", async () => {
    const s = setup();
    s.db.game.findUniqueOrThrow.mockResolvedValueOnce(game()).mockResolvedValueOnce(game(FIXED_WORLD_STYLE_VERSION, "READY")).mockResolvedValueOnce(game(FIXED_WORLD_STYLE_VERSION, "READY"));
    await expect(publishGame(s.c, "game", actor)).resolves.toEqual({ playUrl: "https://example.test/play/token" });
    expect(calls.approve).toHaveBeenCalledExactlyOnceWith(s.c, "game", actor);
    expect(s.email.send).toHaveBeenCalledTimes(1);
    expect(calls.deleteAsset).not.toHaveBeenCalled();
    expect(calls.transition.mock.calls.map(call => call[2])).toEqual(["DELIVERED"]);
  });

  it("does not send again for an already delivered fixed game", async () => {
    const s = setup(game(FIXED_WORLD_STYLE_VERSION, "DELIVERED"));
    await publishGame(s.c, "game", actor);
    expect(calls.approve).toHaveBeenCalledOnce();
    expect(s.email.send).not.toHaveBeenCalled();
  });

  it("blocks direct mail delivery while fixed QA is pending", async () => {
    const s = setup();
    await expect(deliverGameMail(s.c, "game", { type: "SYSTEM" })).rejects.toMatchObject({ code: "permission" });
    expect(calls.link).not.toHaveBeenCalled();
    expect(s.email.send).not.toHaveBeenCalled();
  });

  it("routes fixed deletion with the actual actor and ownership argument", async () => {
    const s = setup(), owner = { type: "USER", id: "owner" } as const;
    await expect(deleteGame(s.c, "game", owner, "owner")).resolves.toBe(true);
    expect(calls.remove).toHaveBeenCalledExactlyOnceWith(s.c, "game", owner, "owner");
    expect(s.db.game.findFirst).not.toHaveBeenCalled();
    expect(calls.deleteAsset).not.toHaveBeenCalled();
    expect(calls.transition).not.toHaveBeenCalled();
  });

  it("never falls back to legacy purge when fixed deletion validation fails", async () => {
    const s = setup();
    calls.remove.mockRejectedValue(new Error("ownership mismatch"));
    await expect(deleteGame(s.c, "game", actor)).rejects.toThrow("ownership mismatch");
    expect(calls.revoke).not.toHaveBeenCalled();
    expect(s.db.game.findFirst).not.toHaveBeenCalled();
  });

  it.each([1, 0])("fences gift edits in one write (successful writes: %s)", async count => {
    const s = setup();
    s.db.game.updateMany.mockResolvedValue({ count });
    await expect(updateGift(s.c, "game", "owner", { message: " hello " })).resolves.toBe(count === 1);
    expect(s.db.game.update).not.toHaveBeenCalled();
    expect(s.db.game.updateMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: expect.objectContaining({ deletedAt: null, ownerId: "owner", updatedAt: now, styleVersion: FIXED_WORLD_STYLE_VERSION, configJson: null }), data: { giftJson: '{"message":"hello"}', configJson: null } }));
  });

  it("gift writes keep the reviewed visual hash and bind the exact previous config", async () => {
    const definition = sceneBySlug("beach"), child = { name: "Child", avatarUrl: "/api/assets/avatar" };
    const scene = composeScene(definition, child, definition.targets.map(target => ({ targetId: target.id, sprite: { kind: "composed", faceUrl: child.avatarUrl, bodyTemplate: target.bodyTemplate } })), "en");
    const config = composeGame({ gameId: "game", child, packageTier: "ONE_WORLD", styleVersion: FIXED_WORLD_STYLE_VERSION, locale: "en", scenes: [scene], now });
    const row = { ...game(), configJson: JSON.stringify(config) }, s = setup(row);
    await updateGift(s.c, "game", "owner", { message: "new gift" });
    const update = s.db.game.updateMany.mock.calls[0]![0] as { where: { configJson: string }; data: { configJson: string } };
    expect(update.where.configJson).toBe(row.configJson);
    const written = JSON.parse(update.data.configJson);
    expect(written.gift).toEqual({ message: "new gift" });
    expect(fixedWorldConfigSha256(written)).toBe(fixedWorldConfigSha256(config));
  });
});

function capsule(snapshot: WorldBudgetSnapshot) {
  const hash = "a".repeat(64), roles = [...Array<string>(27).fill("sprite"), ...Array<string>(27).fill("context"), ...Array<string>(27).fill("mask"), ...Array<string>(9).fill("board"), "source", "provenance"];
  return fixedWorldStageRecordSchema.parse({ version: "fixed-world-stage/v1", status: "done", state: "staged", startedAt: now.toISOString(), finishedAt: now.toISOString(),
    gameId: "game", ownerId: "owner", childProfileId: "child", childAgeYears: 6, worldId: "game:journey", planSha256: hash, budgetSnapshotSha256: fixedWorldJsonSha256(snapshot), configSha256: hash,
    identityAssetId: "identity", identitySha256: hash, avatarAssetId: "avatar", avatarSha256: hash,
    assets: roles.map((role, i) => ({ id: `ast_fixed_${i.toString(16).padStart(64, "0")}`, role, visibility: role === "sprite" || role === "board" ? "GAME" : "PRIVATE", mimeType: role === "provenance" ? "application/json" : "image/png", encodedSha256: hash, width: role === "provenance" ? null : 2, height: role === "provenance" ? null : 2, ...(role === "provenance" ? {} : { rgbaSha256: hash }) })),
    scenes: Array.from({ length: 9 }, (_, i) => ({ slug: `board${i}`, sceneVersion: 1, configSha256: hash })),
  });
}
function settledBudget(): WorldBudgetSnapshot {
  return { worldId: "game:journey", requests: ["identity", "image", "judge"].map((scope, i) => ({ requestKey: scope, scope: scope as "identity" | "image" | "judge", operationFingerprint: `fingerprint-${i}`, reserveMicroUsd: 1_000_000, state: "settled", origin: "reserved", unknownReasons: [], conflicts: [],
    evidence: { providerNamespace: "openai:test", providerRequestId: `request-${i}`, usageId: `usage-${i}`, rawUsage: { tokens: 1 }, model: i === 1 ? "gpt-image-2" : "gpt-5.6-sol", amountMicroUsd: 100_000 + i * 10_000, costBasis: "provider-billed" } })) };
}
describe("fixed-world admin costs come from the strict complete ledger", () => {
  it("counts identity, reused source and observer charges once, not zero-cost sprite rows", async () => {
    const s = setup(), snapshot = settledBudget();
    s.db.generationJob.findUnique.mockResolvedValue({ stepsJson: JSON.stringify({ fixedWorld: capsule(snapshot) }) });
    calls.budgetRead.mockResolvedValue({ revision: 1, snapshot });
    await expect(generationCostCents(s.c, "game")).resolves.toBe(33);
    expect(s.db.targetVariantAsset.findMany).not.toHaveBeenCalled();
    expect(s.db.asset.findMany).not.toHaveBeenCalled();
  });

  it("rejects missing or malformed capsules instead of displaying zero", async () => {
    const s = setup();
    await expect(generationCostCents(s.c, "game")).rejects.toMatchObject({ code: "integrity" });
    s.db.generationJob.findUnique.mockResolvedValue({ stepsJson: '{"fixedWorld":{}}' });
    await expect(generationCostCents(s.c, "game")).rejects.toMatchObject({ code: "integrity" });
  });

  it("rejects drift in the current ledger", async () => {
    const s = setup(), snapshot = settledBudget();
    s.db.generationJob.findUnique.mockResolvedValue({ stepsJson: JSON.stringify({ fixedWorld: capsule(snapshot) }) });
    calls.budgetRead.mockResolvedValue({ revision: 1, snapshot: { ...snapshot, requests: [] } });
    await expect(generationCostCents(s.c, "game")).rejects.toMatchObject({ code: "budget" });
  });

  it.each(["pending", "unknown"] as const)("does not turn %s reserves into a free-looking total", async state => {
    const s = setup(), snapshot: WorldBudgetSnapshot = { worldId: "game:journey", requests: [{ requestKey: "held", scope: "judge", operationFingerprint: "held-fingerprint", reserveMicroUsd: 300_000, state, origin: "reserved", unknownReasons: state === "unknown" ? ["unreadable response"] : [], conflicts: [] }] };
    s.db.generationJob.findUnique.mockResolvedValue({ stepsJson: JSON.stringify({ fixedWorld: capsule(snapshot) }) });
    calls.budgetRead.mockResolvedValue({ revision: 1, snapshot });
    await expect(generationCostCents(s.c, "game")).rejects.toMatchObject({ code: "budget" });
    await expect(generationCostForDisplay(s.c, "game")).resolves.toBeNull();
  });

  it("displays unavailable pre-staging costs as null while the strict helper still rejects", async () => {
    const s = setup();
    await expect(generationCostForDisplay(s.c, "game")).resolves.toBeNull();
    await expect(generationCostCents(s.c, "game")).rejects.toMatchObject({ code: "integrity" });
    await expect(orderDetailForAdmin(s.c, "game")).resolves.toMatchObject({ costCents: null, status: "MANUAL_REVIEW" });
  });

  it("preserves known costs through the display helper", async () => {
    const s = setup(), snapshot = settledBudget();
    s.db.generationJob.findUnique.mockResolvedValue({ stepsJson: JSON.stringify({ fixedWorld: capsule(snapshot) }) });
    calls.budgetRead.mockResolvedValue({ revision: 1, snapshot });
    await expect(generationCostForDisplay(s.c, "game")).resolves.toBe(33);
  });

  it("keeps dashboard rows but leaves cost and margin unknown", async () => {
    const s = setup();
    s.db.game.findMany.mockResolvedValue([{ ...game(), orders: [{ paymentStatus: "PAID", currency: "USD", amountAgorot: 1000 }] }]);
    await expect(costDashboard(s.c)).resolves.toEqual([expect.objectContaining({ gameId: "game", generationCents: null, marginPct: null, priceMinor: 1000 })]);
  });
});
