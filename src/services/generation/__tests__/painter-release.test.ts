import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { LOCAL_PATCH_IMAGE_POLICY, LOCAL_PATCH_LOW_IMAGE_POLICY, localPatchRenderPolicySha256 } from "../../../infra/generation/openai-local-patch";
import type { Container } from "../../container";
import { createDraft, sceneVersionForDraft } from "../../create-flow.service";
import { beginWorldPurchase } from "../../world-purchase.service";
import { boardsOfWorlds } from "../../world-catalog.service";
import { DETECTIVE_RELEASES } from "../../../../content/worlds/detective-releases";
import { DUAL_VISUAL_REVIEW_V3, DUAL_VISUAL_REVIEW_VERSION, dualVisualReviewVersion } from "../visual-review-release";
import { newQaWorldBudgetAuditId } from "../local-patch-qa-budget";
import { boardWizardWorldId } from "../board-conditioned-wizard";
import { LOCAL_PATCH_LOW_PAINTER, localPatchPainterAuditId, localPatchPainterRelease, lowPainterQualified, pinLocalPatchPainter } from "../painter-release";
import * as world from "../local-patch-world";
import { tickGeneration } from "../queue";
import { runGenerationPipeline } from "../pipeline";

/**
 * Which quality a game's hides are painted at, pinned when its draft is
 * created. No provider is called: the painter's one request goes to a fake wire.
 */

const fakes = vi.hoisted(() => ({ appEnv: "qa", release: "v19", testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({
  env: () => ({ APP_ENV: fakes.appEnv, LOCAL_PATCH_PROMPT_RELEASE: fakes.release, GENERATION_ENABLED: "on",
    GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", OPENAI_API_KEY: "synthetic-never-live" }),
  spendGuard: () => ({ appEnv: fakes.appEnv, realGeneration: true, testers: fakes.testers }), flag: () => false, adminEmails: () => [],
}));

const LOW_SHA = localPatchRenderPolicySha256(LOCAL_PATCH_LOW_IMAGE_POLICY), MEDIUM_SHA = localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY);
let directory: string, db: PrismaClient, c: Container, sequence = 0;
let crop: Buffer, identity: Buffer, mask: Buffer, painted: Buffer;

beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-painter-release-")));
  db = new PrismaClient({ datasources: { db: { url: "file:" + path.join(directory, "test.db").replaceAll("\\", "/") } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), analytics: { track: vi.fn() }, pinDualVisualReview: true, dualVisualReviewRelease: DUAL_VISUAL_REVIEW_V3,
    visualReview: { request: vi.fn() }, localPatchPainter: LOCAL_PATCH_LOW_PAINTER } as unknown as Container;
  crop = await sharp({ create: { width: 512, height: 768, channels: 4, background: "#d2be96" } }).png().toBuffer();
  identity = await sharp({ create: { width: 512, height: 512, channels: 4, background: "#e2b294" } }).png().toBuffer();
  const hole = await sharp({ create: { width: 252, height: 500, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } } }).png().toBuffer();
  mask = await sharp({ create: { width: 512, height: 768, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } })
    .composite([{ input: hole, left: 130, top: 150, blend: "dest-out" }]).png().toBuffer();
  painted = await sharp({ create: { width: 768, height: 1152, channels: 4, background: "#8090a0" } }).png().toBuffer();
}, 60_000);
beforeEach(() => { fakes.appEnv = "qa"; fakes.release = "v19";
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("No provider request permitted"); })); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
afterAll(async () => { await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-painter-release-")) rmSync(directory, { recursive: true }); });

/** A draft created under `container`, then paid and painting the journey world's nine v12 boards. */
async function paintingGame(container: Container = c, contentVersion = 12) {
  const draft = await createDraft(container, null, "he");
  const ownerId = "usr-" + draft.gameId, childId = "chl-" + draft.gameId;
  await db.user.create({ data: { id: ownerId, email: draft.gameId + "@example.invalid" } });
  // A painting QA world's owner is a permitted tester; otherwise the queue parks it before any slice.
  fakes.testers.push((draft.gameId + "@example.invalid").toLowerCase());
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Synthetic", ageYears: 6 } });
  await db.game.update({ where: { id: draft.gameId }, data: { ownerId, childProfileId: childId, status: "TARGETS_GENERATING", paidAt: new Date(), sceneCount: 9 } });
  await db.gameScene.createMany({ data: boardsOfWorlds(["journey"]).map((slug, orderIndex) => ({ id: `${draft.gameId}-s-${orderIndex}`,
    gameId: draft.gameId, sceneSlug: slug, sceneVersion: contentVersion, orderIndex })) });
  await db.generationJob.create({ data: { id: "job_" + draft.gameId, gameId: draft.gameId, status: "QUEUED", stepsJson: "{}" } });
  return draft.gameId;
}
const request = () => ({ worldId: "synthetic:board-wizard", requestKey: "synthetic-hide:kneeling:render:1",
  prompt: "Paint the child into the marked area.", stylePng: crop, identityPng: identity, maskPng: mask });
const answer = () => new Response(JSON.stringify({ model: "gpt-image-2",
  usage: { input_tokens: 30, output_tokens: 196, total_tokens: 226, input_tokens_details: { text_tokens: 10, image_tokens: 20 } },
  data: [{ b64_json: painted.toString("base64") }] }), { status: 200, headers: { "x-request-id": `req-painter-${++sequence}` } });
/** The quality one paid painting of this game would be asked at, on a fake wire. */
async function qualityOnTheWire(gameId: string, contentVersion = 12) {
  const painter = await world.localPatchPainterForGame(c, gameId, contentVersion);
  const wire = vi.fn(async () => answer());
  vi.stubGlobal("fetch", wire);
  await painter!.render(request());
  expect(wire).toHaveBeenCalledTimes(1);
  const form = (wire.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
  return { quality: form.get("quality"), model: form.get("model"), size: form.get("size"), renderPolicySha256: painter!.renderPolicySha256 };
}
const slice = (gameId: string) => ({ gameId, pending: false, claimed: true, paused: false, attention: null, outcomes: [], blocked: [] });

describe("the painter a new draft is pinned to", () => {
  it("pins LOW atomically beside the draft's review and budget pins, and paints LOW", async () => {
    const draft = await createDraft(c, null, "he");
    expect(await localPatchPainterRelease(db, draft.gameId)).toBe(LOCAL_PATCH_LOW_PAINTER);
    expect(await dualVisualReviewVersion(db, draft.gameId)).toBe(DUAL_VISUAL_REVIEW_V3);
    expect(await db.auditLog.findUnique({ where: { id: newQaWorldBudgetAuditId(boardWizardWorldId(draft.gameId)) } })).not.toBeNull();
    const pin = await db.auditLog.findUniqueOrThrow({ where: { id: localPatchPainterAuditId(draft.gameId) } });
    expect(JSON.parse(pin.metaJson!)).toEqual({ version: LOCAL_PATCH_LOW_PAINTER, gameId: draft.gameId, contentVersion: 12, quality: "low",
      renderPolicySha256: LOW_SHA, qualifiedWith: { promptRelease: "v19", visualReviewRelease: DUAL_VISUAL_REVIEW_V3 } });
    const gameId = await paintingGame();
    expect(await qualityOnTheWire(gameId)).toEqual({ quality: "low", model: "gpt-image-2", size: "768x1152", renderPolicySha256: LOW_SHA });
  });

  it("leaves a draft created without the setting on v12's own MEDIUM, whatever is set later", async () => {
    const gameId = await paintingGame({ ...c, localPatchPainter: undefined });
    expect(await localPatchPainterRelease(db, gameId)).toBeNull();
    // The container now asks for LOW: a game that exists is never re-read from it.
    expect(c.localPatchPainter).toBe(LOCAL_PATCH_LOW_PAINTER);
    expect(await qualityOnTheWire(gameId)).toEqual({ quality: "medium", model: "gpt-image-2", size: "768x1152", renderPolicySha256: MEDIUM_SHA });
  });

  it("never pins a game that is paid or started", async () => {
    const gameId = await paintingGame({ ...c, localPatchPainter: undefined });
    await expect(db.$transaction(tx => pinLocalPatchPainter(tx, gameId, LOCAL_PATCH_LOW_PAINTER))).rejects.toThrow("unstarted new local-patch draft");
    expect(await localPatchPainterRelease(db, gameId)).toBeNull();
  });

  it.each([
    ["prompt release v18", { release: "v18" }, {}],
    ["dual review v1", {}, { dualVisualReviewRelease: DUAL_VISUAL_REVIEW_VERSION }],
    ["the single legacy judge", {}, { pinDualVisualReview: false }],
  ] as const)("refuses the draft, rather than painting it LOW or MEDIUM, under %s", async (_label, environment, container) => {
    Object.assign(fakes, environment);
    const before = await db.game.count();
    await expect(createDraft({ ...c, ...container } as Container, null, "he")).rejects.toThrow("qualified only on QA with prompt release v19 and dual review v3");
    expect(await db.game.count()).toBe(before);
  });

  it("states the qualified configuration exactly", () => {
    const good = { appEnv: "qa", promptRelease: "v19", reviewRelease: DUAL_VISUAL_REVIEW_V3 };
    expect(lowPainterQualified(good)).toBe(true);
    for (const changed of [{ appEnv: "production" }, { appEnv: "development" }, { promptRelease: "v18" }, { reviewRelease: DUAL_VISUAL_REVIEW_VERSION }, { reviewRelease: null }])
      expect(lowPainterQualified({ ...good, ...changed })).toBe(false);
  });

  it("creates no local-patch draft, and so no pin, outside QA", async () => {
    fakes.appEnv = "production";
    const draft = await createDraft(c, null, "he");
    expect((await db.game.findUniqueOrThrow({ where: { id: draft.gameId } })).styleVersion).not.toBe("local-patch-world-v1");
    expect(await localPatchPainterRelease(db, draft.gameId)).toBeNull();
  });

  it("pins the draft a world purchase creates, in the same transaction", async () => {
    const id = `painter-purchase-${++sequence}`;
    await db.user.create({ data: { id: `${id}-owner`, email: `${id}@example.invalid` } });
    await db.familyChild.create({ data: { id: `${id}-child`, ownerId: `${id}-owner`, displayName: "Synthetic child" } });
    const started = await beginWorldPurchase(c, { ownerId: `${id}-owner`, familyChildId: `${id}-child`, worldSlug: "journey", ageYears: 6, locale: "he" });
    if (!started.ok) throw Error(`Synthetic purchase draft was not created: ${started.code}`);
    expect(await localPatchPainterRelease(db, started.gameId)).toBe(LOCAL_PATCH_LOW_PAINTER);
    expect((await db.gameScene.findMany({ where: { gameId: started.gameId } })).every(scene => scene.sceneVersion === 12)).toBe(true);
  });

  it.each(["quality", "renderPolicySha256", "contentVersion", "gameId", "qualifiedWith"])("refuses a pin with a changed %s instead of falling back", async key => {
    const gameId = await paintingGame(), id = localPatchPainterAuditId(gameId);
    const receipt = JSON.parse((await db.auditLog.findUniqueOrThrow({ where: { id } })).metaJson!);
    receipt[key] = key === "contentVersion" ? 11 : key === "qualifiedWith" ? { promptRelease: "v18", visualReviewRelease: DUAL_VISUAL_REVIEW_V3 } : key === "quality" ? "medium" : "changed";
    await db.auditLog.update({ where: { id }, data: { metaJson: JSON.stringify(receipt) } });
    await expect(localPatchPainterRelease(db, gameId)).rejects.toThrow("refusing a fallback");
    await expect(world.localPatchPainterForGame(c, gameId, 12)).rejects.toThrow("refusing a fallback");
  });

  it("refuses another game's receipt", async () => {
    const a = await paintingGame(), b = await paintingGame();
    const borrowed = (await db.auditLog.findUniqueOrThrow({ where: { id: localPatchPainterAuditId(a) } })).metaJson;
    await db.auditLog.update({ where: { id: localPatchPainterAuditId(b) }, data: { metaJson: borrowed } });
    await expect(localPatchPainterRelease(db, b)).rejects.toThrow("refusing a fallback");
  });

  it("paints only the content version it was qualified on", async () => {
    const gameId = await paintingGame(c, 11);
    await expect(world.localPatchPainterForGame(c, gameId, 11)).rejects.toThrow("content version 12 only");
    await expect(tickGeneration(c, gameId, 60_000)).rejects.toThrow("content version 12 only");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the LOW pin on v12 while the qualified Detective family uses its own MEDIUM policy", () => {
    expect(sceneVersionForDraft("local-patch-world-v1")).toBe(12);
    expect(DETECTIVE_RELEASES.map(release => release.sceneVersion)).toEqual([13,13]);
    expect(DETECTIVE_RELEASES.map(release=>release.worldSlug)).toEqual(["journey","kingdom"]);
    expect(world.localPatchPainterDeps(c, 13, null)?.renderPolicySha256).toBe(MEDIUM_SHA);
    expect(() => world.localPatchPainterDeps(c, 13, LOCAL_PATCH_LOW_PAINTER)).toThrow("content version 12 only");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("the queue and the pipeline paint each game with its own pin", () => {
  it.each([["queue", (id: string) => tickGeneration(c, id, 60_000)], ["pipeline", (id: string) => runGenerationPipeline(c, id)]] as const)(
    "the %s hands the slice the pinned painter, and v12's own to an unpinned game", async (_route, run) => {
      const sliced = vi.spyOn(world, "runLocalPatchWorldSlice").mockImplementation(async (_c, _deps, gameId) => slice(gameId));
      const pinned = await paintingGame(), unpinned = await paintingGame({ ...c, localPatchPainter: undefined });
      await run(pinned); await run(unpinned);
      expect(sliced.mock.calls.map(([, deps, gameId]) => [gameId, deps.renderPolicySha256])).toEqual([[pinned, LOW_SHA], [unpinned, MEDIUM_SHA]]);
      expect(fetch).not.toHaveBeenCalled();
    });
});
