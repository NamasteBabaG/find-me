import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { PrismaWorldBudgetStore } from "../../../infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../../../infra/db/world-budget-repository";
import { boardConditionedCheckpointKeys, PrismaBoardConditionedCheckpointStore } from "../../../infra/db/board-conditioned-checkpoints";
import type { Container } from "../../container";
import { deleteGame } from "../../game.service";
import { prepareBoardConditionedSource, type BoardConditioningInput } from "../board-conditioned-source";
import { enrollBoardConditionedQaGame, runBoardConditionedQaSlice, readBoardConditionedQaReview, recoverBoardConditionedQaClaim, registerBoardConditionedQaReference, boardQaWorldArtifactPrefix, BOARD_QA_STALE_CLAIM_MS, BOARD_CONDITIONED_QA_STYLE, type BoardConditionedQaEnrollmentInput, type BoardConditionedQaBoard } from "../board-conditioned-qa-job";
import { WorldBudget } from "../world-budget";
import { sha256Bytes } from "../fixed-sprite";

const settings = vi.hoisted(() => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0, OPENAI_API_KEY: "synthetic-never-live", testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => settings, spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: settings.testers }) }));
const sourcePolicy = { reserveMicroUsd: 200_000, providerNamespace: "openai:test", timeoutMs: 1000, rateCard: { id: "fixture", textInput: 5, imageInput: 8, imageOutput: 30 } };
const observerPolicy = { reserveMicroUsd: 300_000, providerNamespace: "openai:test", timeoutMs: 1000 };
const admin = { type: "ADMIN" as const, id: "qa-admin" };
let db: PrismaClient, scratch: string, counter = 0, png: Buffer, fg: Buffer, sheet: Buffer;
const bound = (png: Buffer) => ({ png, sha256: sha256Bytes(png) });
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-board-qa-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db); await db.user.create({ data: { id: admin.id, email: "qa-admin@example.invalid" } });
  png = await sharp({ create: { width: 120, height: 120, channels: 4, background: "#384970" } }).png().toBuffer();
  fg = await sharp({ create: { width: 120, height: 120, channels: 4, background: "#00000000" } }).composite([{ input: await sharp({ create: { width: 120, height: 45, channels: 4, background: "#384970" } }).png().toBuffer(), left: 0, top: 75 }]).png().toBuffer();
  const rgba = Buffer.alloc(1024 * 1024 * 4);
  for (const centre of [170, 512, 853]) for (let y = 140; y < 700; y++) for (let x = centre - 60; x < centre + 60; x++) {
    const p = (y * 1024 + x) * 4; rgba[p] = 150; rgba[p + 1] = 80; rgba[p + 2] = 60; rgba[p + 3] = 253;
  }
  sheet = await sharp(rgba, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
});
beforeEach(() => { settings.GENERATION_ENABLED = "on"; settings.GENERATION_DAILY_CENTS = 0; settings.OPENAI_API_KEY = "synthetic-never-live"; settings.testers = []; });
afterAll(async () => {
  await db?.$disconnect(); const target = path.resolve(scratch);
  if (path.dirname(target) === realpathSync(tmpdir()) && path.basename(target).startsWith("findme-board-qa-")) rmSync(target, { recursive: true, force: true });
});
async function fixture(boardCount = 1) {
  const gameId = `boardqa-${++counter}`, childId = `${gameId}-child`, ownerId = `${gameId}-owner`, email = `${gameId}@example.invalid`, identityId = `${gameId}-identity`;
  await db.user.create({ data: { id: ownerId, email } }); settings.testers.push(email);
  await db.asset.create({ data: { id: identityId, ownerId, type: "IDENTITY_SHEET", visibility: "PRIVATE", mimeType: "image/png", storagePath: `fixture/${identityId}.png`, bytes: png.length, width: 120, height: 120 } });
  await db.fileBlob.create({ data: { key: `fixture/${identityId}.png`, contentType: "image/png", data: new Uint8Array(png) } });
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Fixture Child", ageYears: 8, identityAssetId: identityId } });
  const boards: BoardConditionedQaBoard[] = [];
  for (let board = 0; board < boardCount; board++) {
    const input: BoardConditioningInput = { boardId: `board-${board}`, board: bound(png), child: { profileId: childId, ageYears: 8, illustratedIdentity: bound(png), referenceRole: "illustrated-identity" },
      slots: (["front-peek", "side-lean", "wave-peek"] as const).map((pose, i) => ({ slot: { id: `slot-${board}-${i}`, pose, eye: { x: 20 + i * 40, y: 50 }, faceHeightPx: 8, window: { left: i * 40, top: 0, width: 40, height: 120 } }, foreground: bound(fg),
        context: { left: i * 40, top: 0, width: 40, height: 120 }, originalPeople: { left: i * 40, top: 0, width: 20, height: 30 }, poseDescription: `Natural ${pose} upper body`, wardrobe: "Pink cardigan over cotton shirt",
        lighting: { key: "Cool street light above", fill: "Blue violet ambient", shadows: "Broad painted shadows", exposure: "Like nearby painted people" } })) };
    boards.push({ sceneVersion: 1, input, expectedContractSha256: (await prepareBoardConditionedSource(input, sourcePolicy)).contractSha256 });
  }
  const forbidden = vi.fn(() => { throw new Error("No commerce, publication or legacy generation"); });
  const c = { db, storage: new DbStorage(db), adminEmails: ["QA-ADMIN@EXAMPLE.INVALID"], email: { send: forbidden }, jobs: { enqueue: forbidden }, avatars: { createCharacter: forbidden }, payment: { createCheckout: forbidden } } as unknown as Container;
  const input: BoardConditionedQaEnrollmentInput = { gameId, childProfileId: childId, boards, sourcePolicy };
  const worldId = `${gameId}:board-conditioned`, ledger = () => db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
  let calls = 0;
  const fetchOnce = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const n = ++calls;
    if (String(url).endsWith("/images/edits")) return new Response(JSON.stringify({ model: "gpt-image-2", usage: { input_tokens: 30, output_tokens: 196, input_tokens_details: { text_tokens: 10, image_tokens: 20 } }, data: [{ b64_json: sheet.toString("base64") }] }), { headers: { "x-request-id": `req-image-${n}` } });
    const text = JSON.parse(String(init?.body)).messages[0].content[0].text as string;
    const board = boards.find(b => text.includes(b.input.slots[0]!.slot.id))!;
    const observation = { figureCount: 3, extraProps: false, cells: board.input.slots.map((s, i) => {
      const x = [170, 512, 853][i]!, reading = (x: number, y: number) => ({ status: "observed", point: { x, y }, confidence: .96, reason: "Observed visible landmark" });
      return { slotId: s.slot.id, pose: s.slot.pose, poseMatches: true, visibleHeadArmsComplete: true, eye: reading(x, 200), chin: reading(x, 250), protectedFacePolygon: { status: "observed", confidence: .96, reason: "Visible entire face", polygon: [{ x: x - 30, y: 175 }, { x: x + 30, y: 175 }, { x: x + 30, y: 249 }, { x: x - 30, y: 249 }] } };
    }), reason: "Three complete visible upper-body poses" };
    return new Response(JSON.stringify({ id: `chatcmpl-${n}`, model: "gpt-5.6-sol", usage: { prompt_tokens: 2000, completion_tokens: 400, total_tokens: 2400 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(observation) } }] }), { headers: { "x-request-id": `req-observer-${n}` } });
  });
  return { input, c, gameId, childId, ownerId, identityId, boards, worldId, ledger, forbidden, fetchOnce, options: { sourcePolicy, observerPolicy, fetch: fetchOnce as typeof fetch } };
}
describe("board-conditioned QA operator job on disposable SQLite", () => {
  it("enrolls a separate frozen nonplayable game without commerce or paid work", async () => {
    const f = await fixture(); expect(await enrollBoardConditionedQaGame(f.c, f.input, admin)).toMatchObject({ reused: false, status: "QA_PENDING", automaticRelease: false });
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ styleVersion: BOARD_CONDITIONED_QA_STYLE, status: "QA_PENDING", configJson: null, paidAt: null, draftToken: null });
    expect(JSON.parse((await f.ledger()).snapshotJson)).toEqual({ worldId: f.worldId, requests: [] });
    expect(await db.order.count({ where: { gameId: f.gameId } })).toBe(0); expect(await db.shareLink.count({ where: { gameId: f.gameId } })).toBe(0); expect(f.forbidden).not.toHaveBeenCalled();
  });
  it("re-enrollment preserves an unknown reservation and every job byte", async () => {
    const f = await fixture(); await enrollBoardConditionedQaGame(f.c, f.input, admin);
    const budget = new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db)));
    await budget.reserve(f.worldId, { requestKey: "existing", scope: "image", operationFingerprint: "fixed", reserveMicroUsd: 200_000 }); await budget.markUnknown(f.worldId, "existing", "lost synthetic reply");
    const before = await f.ledger(), job = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } });
    expect(await enrollBoardConditionedQaGame(f.c, f.input, admin)).toMatchObject({ reused: true }); expect(await f.ledger()).toEqual(before);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: job.id } })).toEqual(job);
    await expect(runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options)).rejects.toMatchObject({ code: "budget" }); expect(f.fetchOnce).not.toHaveBeenCalled();
  });
  it.each(["wrong-admin", "user-role", "foreign-reference", "photo-reference", "missing-identity", "legacy-game"])("rejects %s without partial enrollment", async kind => {
    const f = await fixture(); let actor: Parameters<typeof enrollBoardConditionedQaGame>[2] = admin;
    if (kind === "wrong-admin") actor = { type: "ADMIN", id: f.ownerId };
    if (kind === "user-role") actor = { type: "USER", id: admin.id };
    if (kind === "foreign-reference") await db.asset.update({ where: { id: f.identityId }, data: { ownerId: admin.id } });
    if (kind === "photo-reference") await db.asset.update({ where: { id: f.identityId }, data: { type: "ORIGINAL_PHOTO" } });
    if (kind === "missing-identity") await db.childProfile.update({ where: { id: f.childId }, data: { identityAssetId: null } });
    if (kind === "legacy-game") await db.game.create({ data: { id: f.gameId, childProfileId: f.childId, ownerId: f.ownerId, status: "PAID" } });
    await expect(enrollBoardConditionedQaGame(f.c, f.input, actor)).rejects.toThrow(); expect(await db.worldBudgetLedger.findUnique({ where: { worldId: f.worldId } })).toBeNull();
    expect(await db.generationJob.count({ where: { gameId: f.gameId } })).toBe(0); expect(f.forbidden).not.toHaveBeenCalled();
  });
  it("rejects an explicitly owned sheet without a canonical child identity or lineage", async () => {
    const f = await fixture(); await db.childProfile.update({ where: { id: f.childId }, data: { identityAssetId: null } });
    f.input.boards[0]!.referenceAssetId = f.identityId;
    await expect(enrollBoardConditionedQaGame(f.c, f.input, admin)).rejects.toMatchObject({ code: "identity" });
  });
  it("rejects a changed frozen contract and does not reset ledger", async () => {
    const f = await fixture(); await enrollBoardConditionedQaGame(f.c, f.input, admin); const before = await f.ledger();
    f.boards[0]!.input.slots[0]!.lighting.key = "Completely changed light";
    await expect(runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options)).rejects.toThrow(); expect(await f.ledger()).toEqual(before); expect(f.fetchOnce).not.toHaveBeenCalled();
  });
  it("runs one board by default, resumes the second without re-buying the first, never publishes", async () => {
    const f = await fixture(2); await enrollBoardConditionedQaGame(f.c, f.input, admin);
    const first = await runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options);
    expect(first.state).toBe("in-progress"); expect(f.fetchOnce).toHaveBeenCalledTimes(2);
    const second = await runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options);
    expect(second.state).toBe("review-required"); expect(f.fetchOnce).toHaveBeenCalledTimes(4);
    expect((await runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options)).state).toBe("review-required"); expect(f.fetchOnce).toHaveBeenCalledTimes(4);
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status: "MANUAL_REVIEW", configJson: null, readyAt: null, deliveredAt: null });
    expect(await db.shareLink.count({ where: { gameId: f.gameId } })).toBe(0); expect(f.forbidden).not.toHaveBeenCalled();
  });
  it.each(["kill-switch", "tester", "daily-cap", "active-job"])("does not dispatch through %s guard", async kind => {
    const f = await fixture(); await enrollBoardConditionedQaGame(f.c, f.input, admin);
    if (kind === "kill-switch") settings.GENERATION_ENABLED = "off";
    if (kind === "tester") settings.testers = [];
    if (kind === "daily-cap") { settings.GENERATION_DAILY_CENTS = 1; await db.asset.update({ where: { id: f.identityId }, data: { costCents: 2 } }); }
    if (kind === "active-job") {
      await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { status: "RUNNING" } });
      expect((await runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options)).state).toBe("busy");
    } else await expect(runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options)).rejects.toThrow();
    expect(f.fetchOnce).not.toHaveBeenCalled(); expect(JSON.parse((await f.ledger()).snapshotJson).requests).toHaveLength(0);
  });
  it("unknown source outcome stops once and retains durable reservation", async () => {
    const f = await fixture(); await enrollBoardConditionedQaGame(f.c, f.input, admin); f.fetchOnce.mockRejectedValue(new Error("private token must not leak"));
    await expect(runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options)).rejects.toThrow("cost_unknown");
    await expect(runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options)).rejects.toMatchObject({ code: "budget" }); expect(f.fetchOnce).toHaveBeenCalledTimes(1);
    const budget = new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db)));
    expect(await budget.audit(f.worldId)).toMatchObject({ held: true, reservedMicroUsd: 200_000 });
    expect((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } })).stepsJson).not.toContain("private token");
    const receipt = await new PrismaBoardConditionedCheckpointStore(db).getSourceFailure(f.worldId,f.boards[0]!.input.boardId);
    expect(receipt).toMatchObject({reason:"transport",billing:"unknown",httpStatus:null,jsonStatus:"not-read"});
    expect(JSON.stringify(receipt)).not.toContain("private token");
  });
  it("rejects an invalid observer policy before claiming the job or reserving money", async () => {
    const f = await fixture(); await enrollBoardConditionedQaGame(f.c, f.input, admin);
    const before = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } });
    await expect(runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, { ...f.options, observerPolicy: { ...observerPolicy, reserveMicroUsd: 0 } })).rejects.toThrow("policy");
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
    expect(f.fetchOnce).not.toHaveBeenCalled(); expect(JSON.parse((await f.ledger()).snapshotJson).requests).toHaveLength(0);
  });
  it("stops before observation if canonical child age changes after the paid source", async () => {
    const f = await fixture(); await enrollBoardConditionedQaGame(f.c, f.input, admin);
    const once = f.fetchOnce.getMockImplementation()!;
    f.fetchOnce.mockImplementationOnce(async (url, init) => {
      const response = await once(url, init);
      await db.childProfile.update({ where: { id: f.childId }, data: { ageYears: 9 } });
      return response;
    });
    await expect(runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options)).rejects.toThrow("identity");
    expect(f.fetchOnce).toHaveBeenCalledTimes(1);
    const budget = new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db)));
    expect(await budget.audit(f.worldId)).toMatchObject({ settledMicroUsd: 6090, reservedMicroUsd: 0 });
    expect(JSON.parse((await f.ledger()).snapshotJson).requests).toHaveLength(1);
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status: "MANUAL_REVIEW", configJson: null });
  });

  it("rejects a canonical or explicit same-owner sibling reference", async () => {
    const f = await fixture();
    await db.childProfile.create({ data: { id: `${f.childId}-sibling`, ownerId: f.ownerId, displayName: "Sibling Child", ageYears: 5, identityAssetId: f.identityId } });
    for (const explicit of [false, true]) {
      f.boards[0]!.referenceAssetId = explicit ? f.identityId : undefined;
      await expect(enrollBoardConditionedQaGame(f.c, f.input, admin)).rejects.toThrow("sibling");
    }
    expect(await db.game.findUnique({ where: { id: f.gameId } })).toBeNull();
  });
  async function derivative(f: Awaited<ReturnType<typeof fixture>>) {
    const assetId = `${f.gameId}-derivative`, storagePath = `fixture/${assetId}.png`;
    await db.asset.create({ data: { id: assetId, ownerId: f.ownerId, type: "IDENTITY_SHEET", visibility: "PRIVATE", mimeType: "image/png", storagePath, bytes: png.length } });
    await db.fileBlob.create({ data: { key: storagePath, contentType: "image/png", data: new Uint8Array(png) } });
    f.boards[0]!.referenceAssetId = assetId;
    return { childProfileId: f.childId, assetId, parentIdentityAssetId: f.identityId, expectedAssetSha256: sha256Bytes(png), expectedParentSha256: sha256Bytes(png), attestation: "same-child-illustrated-derivative" as const };
  }
  it("accepts a derivative only after explicit same-child hash-bound lineage and freezes it", async () => {
    const f = await fixture(), input = await derivative(f);
    await expect(enrollBoardConditionedQaGame(f.c, f.input, admin)).rejects.toThrow("lineage");
    const receipt = await registerBoardConditionedQaReference(f.c, input, admin);
    await expect(enrollBoardConditionedQaGame(f.c, f.input, admin)).resolves.toMatchObject({ reused: false });
    const job = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } });
    expect(JSON.parse(job.stepsJson).boardConditionedQa.boards[0].referenceLineageSha256).toBe(receipt.lineageSha256);
    await db.fileBlob.update({ where: { key: `fixture/${f.identityId}.png` }, data: { data: new Uint8Array(fg) } });
    await db.asset.update({ where: { id: f.identityId }, data: { bytes: fg.length } });
    await expect(runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options)).rejects.toMatchObject({ code: "identity" });
    expect(f.fetchOnce).not.toHaveBeenCalled();
  });
  it("does not let an admin label a currently sibling-bound sheet as this child's derivative", async () => {
    const f = await fixture(), input = await derivative(f);
    await db.childProfile.create({ data: { id: `${f.childId}-sibling`, ownerId: f.ownerId, displayName: "Sibling Child", ageYears: 5, identityAssetId: input.assetId } });
    await expect(registerBoardConditionedQaReference(f.c, input, admin)).rejects.toThrow("sibling");
    await expect(registerBoardConditionedQaReference(f.c, input, { type: "USER", id: admin.id })).rejects.toMatchObject({ code: "permission" });
  });
  it("reads back exact saved board, contexts, patches and sprites after the response is lost", async () => {
    const f = await fixture(); await enrollBoardConditionedQaGame(f.c, f.input, admin);
    const result = await runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options);
    expect("results" in result).toBe(true);
    const review = await readBoardConditionedQaReview(f.c, f.gameId, admin), actual = review.reviews[0]!.result;
    expect(actual).toEqual("results" in result ? result.results[0] : null);
    expect(actual.state).toBe("review-required");
    if (actual.state === "review-required") {
      expect(Buffer.isBuffer(actual.boardPreviewPng)).toBe(true);
      expect(actual.appearances.every(p => Buffer.isBuffer(p.sprite.png))).toBe(true);
      expect(actual.appearances.every(p => "composite" in p && Buffer.isBuffer(p.composite?.patchPng) && Buffer.isBuffer(p.composite?.contextPng))).toBe(true);
    }
    expect(review.progress.boards[0]!.reviewManifestSha256).toBe(review.reviews[0]!.manifestSha256);
    await runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options); expect(f.fetchOnce).toHaveBeenCalledTimes(2);
    await expect(readBoardConditionedQaReview(f.c, f.gameId, { type: "USER", id: f.ownerId })).rejects.toMatchObject({ code: "permission" });
    const artifact = review.reviews[0]!.manifest.artifacts[0]!;
    await db.fileBlob.update({ where: { key: artifact.key }, data: { data: new Uint8Array([1, 2]) } });
    await expect(readBoardConditionedQaReview(f.c, f.gameId, admin)).rejects.toThrow("PNG");
    await expect(runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options)).rejects.toThrow("PNG"); expect(f.fetchOnce).toHaveBeenCalledTimes(2);
  });
  async function staleClaim(f: Awaited<ReturnType<typeof fixture>>, stepsJson?: string) {
    await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { status: "RUNNING", currentStep: "board-conditioned", ...(stepsJson ? { stepsJson } : {}), updatedAt: new Date(Date.now() - BOARD_QA_STALE_CLAIM_MS - 1000) } });
    return { sourcePolicy, observerPolicy, expectedClaimSha256: (await readBoardConditionedQaReview(f.c, f.gameId, admin)).claim.sha256, workerStopped: true as const };
  }
  it.each([false, true])("recovers a stale post-paid crash for free (only checkpoints=%s)", async onlyCheckpoints => {
    const f = await fixture(); await enrollBoardConditionedQaGame(f.c, f.input, admin);
    const before = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } });
    await runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options);
    const review = await readBoardConditionedQaReview(f.c, f.gameId, admin), ledger = await f.ledger();
    if (onlyCheckpoints) {
      const manifests = await db.fileBlob.findMany({ where: { key: { startsWith: `${boardQaWorldArtifactPrefix(f.worldId)}review/` } } });
      const owned = manifests.filter(row => JSON.parse(Buffer.from(row.data).toString()).gameId === f.gameId);
      await db.fileBlob.deleteMany({ where: { key: { in: [...owned.map(r => r.key), ...review.reviews[0]!.manifest.artifacts.map(a => a.key)] } } });
    }
    const options = await staleClaim(f, before.stepsJson);
    // Recovery must not need a credential, a live fetch, or generation enabled.
    settings.GENERATION_ENABLED = "off"; settings.OPENAI_API_KEY = "";
    const recovered = await recoverBoardConditionedQaClaim(f.c, f.gameId, f.boards, admin, options);
    settings.OPENAI_API_KEY = "synthetic-never-live";
    expect(recovered).toMatchObject({ state: "review-required", paidDispatch: false, automaticRelease: false });
    expect(recovered.dispositions[0]!.disposition).toBe(onlyCheckpoints ? "reconstructed-free-from-paid-checkpoints" : "preserved-private-review");
    expect((await readBoardConditionedQaReview(f.c, f.gameId, admin)).reviews[0]!.result).toEqual(review.reviews[0]!.result);
    expect(await f.ledger()).toEqual(ledger); expect(f.fetchOnce).toHaveBeenCalledTimes(2);
  });
  it("keeps pending/unknown money intact during explicit stale claim recovery", async () => {
    const f = await fixture(); await enrollBoardConditionedQaGame(f.c, f.input, admin);
    const budget = new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db)));
    await budget.reserve(f.worldId, { requestKey: "board:board-0:source:1", scope: "image", operationFingerprint: "synthetic-lost-request", reserveMicroUsd: 200_000 });
    await budget.markUnknown(f.worldId, "board:board-0:source:1", "lost reply");
    const ledger = await f.ledger(), options = await staleClaim(f);
    expect(await recoverBoardConditionedQaClaim(f.c, f.gameId, f.boards, admin, options)).toMatchObject({ state: "reconciliation-required", paidDispatch: false });
    expect(await f.ledger()).toEqual(ledger); expect(await budget.audit(f.worldId)).toMatchObject({ held: true, reservedMicroUsd: 200_000 });
    await expect(runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options)).rejects.toMatchObject({ code: "budget" }); expect(f.fetchOnce).not.toHaveBeenCalled();
  });
  it("holds a known paid-but-missing source instead of re-buying it", async () => {
    const f = await fixture(); await enrollBoardConditionedQaGame(f.c, f.input, admin);
    const budget = new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db)));
    await budget.reserve(f.worldId, { requestKey: "board:board-0:source:1", scope: "image", operationFingerprint: "known-paid-missing", reserveMicroUsd: 200_000 });
    await budget.settle(f.worldId, "board:board-0:source:1", { providerNamespace: "openai:test", providerRequestId: "req-paid-missing", usageId: "synthetic-receipt", rawUsage: { output_tokens: 196 }, model: "gpt-image-2", amountMicroUsd: 6090, costBasis: "provider-billed" });
    const ledger = await f.ledger(), options = await staleClaim(f);
    expect(await recoverBoardConditionedQaClaim(f.c, f.gameId, f.boards, admin, options)).toMatchObject({ state: "reconciliation-required" });
    expect(await f.ledger()).toEqual(ledger);
    await expect(runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options)).rejects.toMatchObject({ code: "budget" }); expect(f.fetchOnce).not.toHaveBeenCalled();
  });
  it("recovers an unpaid stale claim but rejects a user, changed hash or fresh active claim", async () => {
    const f = await fixture(); await enrollBoardConditionedQaGame(f.c, f.input, admin);
    const options = await staleClaim(f), before = await f.ledger();
    await expect(recoverBoardConditionedQaClaim(f.c, f.gameId, f.boards, { type: "USER", id: f.ownerId }, options)).rejects.toMatchObject({ code: "permission" });
    await expect(recoverBoardConditionedQaClaim(f.c, f.gameId, f.boards, admin, { ...options, expectedClaimSha256: "0".repeat(64) })).rejects.toMatchObject({ code: "conflict" });
    await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { updatedAt: new Date() } });
    const fresh = (await readBoardConditionedQaReview(f.c, f.gameId, admin)).claim.sha256;
    await expect(recoverBoardConditionedQaClaim(f.c, f.gameId, f.boards, admin, { ...options, expectedClaimSha256: fresh })).rejects.toThrow("stale");
    expect(await recoverBoardConditionedQaClaim(f.c, f.gameId, f.boards, admin, await staleClaim(f))).toMatchObject({ state: "in-progress", paidDispatch: false });
    expect(await f.ledger()).toEqual(before); expect(f.fetchOnce).not.toHaveBeenCalled();
  });
  it.each([1, 2])("does not resurrect images when paid response %s arrives after deletion", async deletedOnCall => {
    const f = await fixture(); await enrollBoardConditionedQaGame(f.c, f.input, admin);
    const once = f.fetchOnce.getMockImplementation()!; let calls = 0;
    f.fetchOnce.mockImplementation(async (url, init) => {
      const response = await once(url, init);
      if (++calls === deletedOnCall) expect(await deleteGame(f.c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
      return response;
    });
    await expect(runBoardConditionedQaSlice(f.c, f.gameId, f.boards, admin, f.options)).rejects.toThrow();
    expect(f.fetchOnce).toHaveBeenCalledTimes(deletedOnCall);
    const keys = boardConditionedCheckpointKeys(f.worldId, f.boards[0]!.input.boardId);
    expect(await db.fileBlob.count({ where: { key: { in: [keys.source, keys.measurement] } } })).toBe(0);
    expect(await db.fileBlob.count({ where: { key: { startsWith: boardQaWorldArtifactPrefix(f.worldId) } } })).toBe(0);
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status: "DELETED" });
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } })).toMatchObject({ status: "DONE", stepsJson: "{}" });
    const budget = new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db)));
    expect(await budget.audit(f.worldId)).toMatchObject({ settledMicroUsd: deletedOnCall === 1 ? 6090 : 24090, reservedMicroUsd: 0 });
  });
});
