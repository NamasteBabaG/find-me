import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DETECTIVE_RELEASES, JOURNEY_DETECTIVE_RUNTIME_RELEASE, KINGDOM_DETECTIVE_RUNTIME_RELEASE } from "../../../content/worlds/detective-releases";
import { DETECTIVE_PATCH_BOARDS } from "../../../content/detectives/runtime-release";
import { applyTestSchema } from "../../lib/test-schema";
import { DbStorage } from "../../infra/storage/db";
import { MockPaymentProvider } from "../../infra/payment/mock";
import type { Container } from "../container";
import { attachPhoto, createDraft, loadDraft, searchLevelTerms, selectPackage, worldsForDraft } from "../create-flow.service";
import { chooseDraftChild } from "../family.service";
import { LOCAL_PATCH_LEAN_RELEASE, leanReleaseOf } from "../generation/lean-release";
import { DUAL_VISUAL_REVIEW_V3, DUAL_VISUAL_REVIEW_V2, dualVisualReviewVersion } from "../generation/visual-review-release";
import { IDENTITY_SOURCE_RELEASE, identitySourceReleaseOf } from "../generation/identity-source-release";
import { leanReviewRecoveryOf } from "../generation/lean-review-recovery-pin";
import { sourceFamilyAuditId, sourcePlacementReleaseAuditId, sourcePlacementReleaseOf, resolveLocalPatchBoardsForGame } from "../generation/source-placement-release";

/** Installed admission contract: deliberately NO registry/content/service mocks.
 * Root enables the actual explicit entry only after full content/world qualification.
 * Synthetic local photo/storage and provider interfaces never buy or dispatch. */
const state = vi.hoisted(() => ({ env: {} as Record<string, string> }));
vi.mock("../../lib/env", () => ({ env: () => state.env, spendGuard: () => ({ appEnv: state.env.APP_ENV, realGeneration: false, testers: [] }) }));
const STYLE = "local-patch-world-v1";
let directory: string, db: PrismaClient, photo: Buffer, c: Container;
const noProvider = vi.fn(async () => { throw Error("Provider use forbidden in admission contract"); });
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-detective-admission-")));
  db = new PrismaClient({ datasources: { db: { url: "file:" + path.join(directory, "test.db").replaceAll("\\", "/") } } });
  await applyTestSchema(db);
  photo = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#71869a" } }).png().toBuffer();
  c = { db, storage: new DbStorage(db), payment: new MockPaymentProvider("https://admission.invalid", "synthetic-admission-secret"), appUrl: "https://admission.invalid",
    leanRelease: LOCAL_PATCH_LEAN_RELEASE, pinDualVisualReview: true, dualVisualReviewRelease: DUAL_VISUAL_REVIEW_V3, visualReview: { request: noProvider },
    backgroundReview: { namespace: "openai:find-me-existing", create: noProvider, retrieve: noProvider, cancel: noProvider },
    analytics: { track: vi.fn() }, generation: { createAvatar: noProvider } } as unknown as Container;
  vi.stubGlobal("fetch", noProvider);
});
beforeEach(() => {
  state.env = { APP_ENV: "qa", SEARCH_LEVEL_CHOICE: "on", LOCAL_PATCH_PROMPT_RELEASE: "v19", LOCAL_PATCH_IDENTITY_SOURCE: "full-source-v1" };
  noProvider.mockClear();
});
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-detective-admission-")) rmSync(directory, { recursive: true });
});

describe("actual installed Detective admission", () => {
  it("offers both levels and creates a normal name/photo/package draft with the exact13 family and original base pins", async () => {
    expect(DETECTIVE_RELEASES).toEqual([JOURNEY_DETECTIVE_RUNTIME_RELEASE,KINGDOM_DETECTIVE_RUNTIME_RELEASE]);
    expect(JOURNEY_DETECTIVE_RUNTIME_RELEASE).toEqual({ worldSlug: "journey", styleVersion: STYLE, sceneVersion: 13 });
    const terms = await searchLevelTerms(c, null);
    expect(terms).toMatchObject({ asked: true, required: true, detectives: true, allowedLevels: ["explorers", "detectives"] });
    expect((await worldsForDraft(c, STYLE, "detectives")).map(world => world.slug)).toEqual(["journey"]);
    const draft = await createDraft(c, null, "he", { askSearchLevel: terms.asked, searchLevel: "detectives" });
    const originalPin = await sourcePlacementReleaseOf(db, draft.gameId);
    expect(originalPin).toMatchObject({ baseSceneVersion: 13, familyId: "journey-detectives/v1", searchLevel: "detectives" });
    expect(originalPin!.coverage).toHaveLength(27);
    expect(await db.auditLog.findUnique({ where: { id: sourceFamilyAuditId(draft.gameId) } })).not.toBeNull();
    expect(await db.auditLog.findUnique({ where: { id: sourcePlacementReleaseAuditId(draft.gameId) } })).toBeNull();
    expect(await leanReleaseOf(db, draft.gameId)).toBe(LOCAL_PATCH_LEAN_RELEASE);
    expect(await dualVisualReviewVersion(db, draft.gameId)).toBe(DUAL_VISUAL_REVIEW_V3);
    expect(await identitySourceReleaseOf(db, draft.gameId)).toBe(IDENTITY_SOURCE_RELEASE);
    expect(await leanReviewRecoveryOf(db, draft.gameId)).toMatchObject({ mode: "new-world", gameId: draft.gameId });
    expect(await chooseDraftChild(db, { gameId: draft.gameId, actorId: null, draftToken: draft.draftToken, familyChildId: null, name: "Synthetic child", ageYears: 5, searchLevel: "detectives" })).toEqual({ ok: true });
    expect(await attachPhoto(c, draft.gameId, { buffer: photo, mimeType: "image/png", crop: null })).toEqual({ ok: true });
    expect(await selectPackage(c, draft.gameId, "ONE_WORLD")).toEqual({ ok: true });
    const game = await loadDraft(c, draft.gameId);
    expect(game).toMatchObject({ status: "PACKAGE_SELECTED", searchLevel: "detectives", styleVersion: STYLE, childProfile: { ageYears: 5 } });
    expect(game!.scenes.map(scene => [scene.sceneSlug, scene.sceneVersion])).toEqual(DETECTIVE_PATCH_BOARDS.map(board => [board.board, 13]));
    const context = await resolveLocalPatchBoardsForGame(db, draft.gameId, 13);
    expect(context.boards.flatMap(board => board.hides)).toHaveLength(27);
    expect(context.boards.every(board => board.art.includes("-detectives-"))).toBe(true);
    expect(await sourcePlacementReleaseOf(db, draft.gameId)).toEqual(originalPin);
    expect(await db.order.count({ where: { gameId: draft.gameId } })).toBe(0);
    expect(await db.generationJob.count({ where: { gameId: draft.gameId } })).toBe(0);
    expect(await db.targetVariantAsset.count({ where: { targetInstance: { gameScene: { gameId: draft.gameId } } } })).toBe(0);
    expect(await db.worldBudgetLedger.count({ where: { worldId: draft.gameId + ":board-wizard" } })).toBe(0);
    expect(noProvider).not.toHaveBeenCalled();
    const pinned = await db.auditLog.findMany({ where: { entityId: draft.gameId }, orderBy: { id: "asc" } });
    state.env = { APP_ENV: "production", SEARCH_LEVEL_CHOICE: "off", LOCAL_PATCH_PROMPT_RELEASE: "v15", LOCAL_PATCH_IDENTITY_SOURCE: "legacy" };
    expect(await worldsForDraft(c, STYLE, "detectives")).toEqual([]);
    expect(await sourcePlacementReleaseOf(db, draft.gameId)).toEqual(originalPin);
    expect((await resolveLocalPatchBoardsForGame(db, draft.gameId, 13)).boards.flatMap(board => board.hides)).toHaveLength(27);
    expect(await db.auditLog.findMany({ where: { entityId: draft.gameId }, orderBy: { id: "asc" } })).toEqual(pinned);
  });
  it.each(["production", "choice-off", "missing-full-source", "wrong-prompt", "missing-lean", "missing-dual-pin", "wrong-dual-release", "missing-review-transport"] as const)
  ("refuses new13 under %s before creating a game, receipt or order", async fault => {
    const configured = { ...c };
    if (fault === "production") state.env.APP_ENV = "production";
    if (fault === "choice-off") state.env.SEARCH_LEVEL_CHOICE = "off";
    if (fault === "missing-full-source") state.env.LOCAL_PATCH_IDENTITY_SOURCE = "legacy";
    if (fault === "wrong-prompt") state.env.LOCAL_PATCH_PROMPT_RELEASE = "v15";
    if (fault === "missing-lean") configured.leanRelease = undefined;
    if (fault === "missing-dual-pin") configured.pinDualVisualReview = false;
    if (fault === "wrong-dual-release") configured.dualVisualReviewRelease = DUAL_VISUAL_REVIEW_V2;
    if (fault === "missing-review-transport") configured.visualReview = undefined;
    const before = await Promise.all([db.game.count(), db.auditLog.count(), db.order.count(), db.asset.count()]);
    expect((await searchLevelTerms(configured, null)).detectives).toBe(false);
    expect(await worldsForDraft(configured, STYLE, "detectives")).toEqual([]);
    await expect(createDraft(configured, null, "he", { askSearchLevel: true, searchLevel: "detectives" })).rejects.toThrow("Detectives is unavailable");
    expect(await Promise.all([db.game.count(), db.auditLog.count(), db.order.count(), db.asset.count()])).toEqual(before);
    expect(noProvider).not.toHaveBeenCalled();
  });
});


describe("prospective Explorer single LOW admission", () => {
  it("binds two fresh worlds separately with a hard four-dollar cap, without orders, grants or provider calls", async () => {
    const { EXPLORERS_OPERATIONAL_RELEASE } = await import("../../domain/generation/explorers-operational-policy");
    const { explorersOperationalPolicyOf, explorersOperationalId } = await import("../generation/explorers-operational-policy");
    const { readLeanWorldBudget } = await import("../generation/lean-release");
    const { DETECTIVES_OPERATIONAL_RELEASE } = await import("../../domain/generation/detectives-operational-policy");
    const { detectivesOperationalPolicyOf } = await import("../generation/detectives-operational-policy");
    const release = { ...c, explorersOperationalRelease: EXPLORERS_OPERATIONAL_RELEASE, detectivesOperationalRelease: DETECTIVES_OPERATIONAL_RELEASE };
    const explorer = await createDraft(release, null, "he", { searchLevel: "explorers" });
    const detective = await createDraft(release, null, "he", { searchLevel: "detectives" });
    const first = await explorersOperationalPolicyOf(db, explorer.gameId), second = await detectivesOperationalPolicyOf(db, detective.gameId);
    const { detectiveSourceScopeOf } = await import("../generation/source-family-scope");
    const scope = await detectiveSourceScopeOf(db, detective.gameId);
    expect(first).toMatchObject({ gameId: explorer.gameId, worldId: explorer.gameId + ":board-wizard", model: "gpt-6.1-sol", effort: "low", oneUsableAssessmentPerImage: true, worldCapMicroUsd: 4000000, automaticBudgetExtension: false });
    expect(second).toBeNull();
    expect(scope).toMatchObject({ gameId:detective.gameId, operationalRelease:DETECTIVES_OPERATIONAL_RELEASE });
    expect(scope!.families).toHaveLength(2);
    expect(first!.authorizationSha256).not.toBe(scope!.scopeSha256);
    for (const draft of [explorer, detective]) {
      expect(await readLeanWorldBudget(c, draft.gameId + ":board-wizard")).toMatchObject({ capMicroUsd: 4000000 });
      expect(await db.order.count({ where: { gameId: draft.gameId } })).toBe(0);
      expect(await db.worldBudgetLedger.count({ where: { worldId: draft.gameId + ":board-wizard" } })).toBe(0);
      expect(await db.auditLog.count({ where: { entityId: draft.gameId, actorType: "ADMIN" } })).toBe(0);
    }
    const receipt = await db.auditLog.findUniqueOrThrow({ where: { id: explorersOperationalId(explorer.gameId) } });
    await db.auditLog.update({ where: { id: receipt.id }, data: { metaJson: JSON.stringify({ ...first, effort: "high" }) } });
    const { singleLowReviewAuthorization } = await import("../generation/single-low-policy");
    await expect(singleLowReviewAuthorization(db, explorer.gameId)).rejects.toThrow();
    await db.auditLog.update({ where: { id: receipt.id }, data: { metaJson: receipt.metaJson } });
    expect(await explorersOperationalPolicyOf(db, explorer.gameId)).toEqual(first);
    expect(noProvider).not.toHaveBeenCalled();
  });
  it("does not retrofit old Explorer drafts or let a copied receipt authorize a different game", async () => {
    const { EXPLORERS_OPERATIONAL_RELEASE } = await import("../../domain/generation/explorers-operational-policy");
    const { pinExplorersOperationalPolicy, explorersOperationalPolicyOf, explorersOperationalId } = await import("../generation/explorers-operational-policy");
    const historical = await createDraft(c, null, "he", { searchLevel: "explorers" });
    expect(await explorersOperationalPolicyOf(db, historical.gameId)).toBeNull();
    const born = await createDraft({ ...c, explorersOperationalRelease: EXPLORERS_OPERATIONAL_RELEASE }, null, "he", { searchLevel: "explorers" });
    const row = await db.auditLog.findUniqueOrThrow({ where: { id: explorersOperationalId(born.gameId) } });
    await db.auditLog.create({ data: { ...row, id: explorersOperationalId(historical.gameId), entityId: historical.gameId } });
    await expect(explorersOperationalPolicyOf(db, historical.gameId)).rejects.toThrow("Invalid or foreign");
    await db.auditLog.delete({ where: { id: explorersOperationalId(historical.gameId) } });
    await chooseDraftChild(db, { gameId: historical.gameId, actorId: null, draftToken: historical.draftToken, familyChildId: null, name: "Synthetic", ageYears: 7, searchLevel: "explorers" });
    await attachPhoto(c, historical.gameId, { buffer: photo, mimeType: "image/png", crop: null });
    await expect(db.$transaction(tx => pinExplorersOperationalPolicy(tx, historical.gameId, EXPLORERS_OPERATIONAL_RELEASE, "db"))).rejects.toThrow("before its photo");
    expect(await explorersOperationalPolicyOf(db, historical.gameId)).toBeNull();
    expect(noProvider).not.toHaveBeenCalled();
  });
});
