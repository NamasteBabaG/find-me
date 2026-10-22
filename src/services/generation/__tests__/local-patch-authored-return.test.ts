import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { cropOf, maskForHide } from "../../../domain/scene/local-patch-hides";
import { AUTHORED_PATCH_COMPOSITION_VERSION, LOCAL_PATCH_COMPOSITION_VERSION, localPatchReturnRegion } from "../../../domain/scene/local-patch-return-region";
import type { Container } from "../../container";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import { prepareLocalPatchBoardReview, reviewLocalPatchBoard } from "../local-patch-board-review";
import { localPatchHideEvidenceIds, type LocalPatchBoardJudgeRequest, type LocalPatchBoardJudgeResult } from "../local-patch-judge";
import { localPatchNeedsRecomposition } from "../local-patch-recompose";
import { hasLocalPatchPublicationPolicy, LOCAL_PATCH_PUBLICATION_ACTION, recordLocalPatchPublicationPolicy, localPatchPublicationGeometryHash } from "../local-patch-publication-policy";
import { allowedDualPublication } from "../local-patch-dual-publication";
import { pinVisualReviewRelease, DUAL_VISUAL_REVIEW_V3 } from "../visual-review-release";
import { dualQualityRequest, dualReviewQuestionCandidates } from "../local-patch-dual-review";
import { prepareVisualReview } from "../visual-review";
import { sha256Bytes } from "../fixed-sprite";
import { planLocalPatchEvidenceRecovery } from "../local-patch-evidence-plan";
import { expectedAuthoredLocalPatchReturn, authoredLocalPatchReviewBinding } from "../local-patch-authored-return";
import { PrismaRetainedPurchaseStore, retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { retainedPayloadDigest } from "../paid-operation";
import { verifiedDualStage } from "../local-patch-dual-evidence";
import { SUBJECT_UPGRADE_ACTION, SUBJECT_UPGRADE_VERSION, SUBJECT_REVIEW_RECOVERY, subjectUpgradeAuditId, subjectUpgradeReceiptSchema } from "../subject-enrollment";
import { SUBJECT_POLICY_VERSION, SUBJECT_POLICY_V2 } from "../../../domain/generation/subject-policy";
import { BACKGROUND_REVIEW_TRANSPORT } from "../../../domain/generation/background-review-round";
import { CONTINUITY_READER_STRICT } from "../../../domain/scene/local-patch-body-continuity";
import { bill, paintedCrop, paintedOk, seedApprovedGame } from "./local-patch-fixtures";
import { GOOD_V12_VERDICT, dualReviewer, longAnswer, publicationBinding } from "./local-patch-dual-fixtures";

// Only the test's giza/first hide receives a prospective authored window. The
// shipped catalogue, scene source hash, other hides and other versions stay real.
const controls = vi.hoisted(() => ({ authored: true, inset: 8, testers: [] as string[] }));
vi.mock("../../../domain/scene/local-patch-catalog", async importOriginal => {
  const real = await importOriginal<typeof import("../../../domain/scene/local-patch-catalog")>();
  const boards = (version: number) => real.localPatchBoardsForVersion(version).map(board => {
    if (!controls.authored || version !== 12 || board.board !== "giza") return board;
    const hides = board.hides.map((hide, index) => {
      if (index) return hide;
      const mask = hide.mask!;
      const left = Math.max(0, mask.left - 120), top = Math.max(0, mask.top - 120);
      const width = Math.min(512, mask.left + mask.width + 120) - left;
      const height = Math.min(768, mask.top + mask.height + 120) - top;
      const n = controls.inset;
      return { ...hide, returnRect: { left: left + n, top: top + n, width: width - 2 * n, height: height - 2 * n } };
    });
    return { ...board, hides };
  });
  return { ...real, localPatchBoardsForVersion: boards,
    localPatchBoardForVersion: (slug: string, version: number) => boards(version).find(b => b.board === slug) ?? null };
});
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: controls.testers }), flag: () => false, adminEmails: () => [] }));

let directory: string, db: PrismaClient, c: Container, source: Buffer;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-authored-return-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.sqlite").replaceAll("\\", "/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db) } as unknown as Container;
  source = await sharp({ create: { width: 3840, height: 2160, channels: 4, background: "#d2be96" } }).png().toBuffer();
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live requests forbidden in authored-return regression"); }));
}, 180_000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-authored-return-")) rmSync(directory, { recursive: true });
});
beforeEach(() => { controls.authored = true; controls.inset = 8; });

// Real services, identity/paid-operation ledgers, blobs and publication audit;
// the image source and both providers are controlled synthetic pixel fixtures.
async function seed(gameId: string, options: { authored?: boolean; dual?: boolean } = {}) {
  controls.authored = options.authored !== false;
  const boards = localPatchBoardsForVersion(12).slice(0, 9), board = boards.find(b => b.board === "giza")!;
  const hide = board.hides[0]!;
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: "local-patch-world-v1", status: "TARGETS_GENERATING",
    withJob: true, scenes: boards.map(b => ({ slug: b.board, version: 12 })) });
  controls.testers.push(seeded.email);
  await db.order.create({ data: { id: `ord-${gameId}`, gameId, userId: seeded.userId, provider: "mock", packageTier: "ONE_WORLD",
    amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  await c.storage.put(`private/photo-${gameId}.jpg`, seeded.sheet, "image/png");
  const catalog = await readBoardConditionedCatalog();
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
    write: work => db.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: `req-identity-${gameId}`,
      body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop", message: {
        content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Controlled identity" }) } }] } }) } },
  { gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: 12,
    provenance: { promptVersion: "character-v6-painted-identity-geometry", quality: "medium", photoAssetId: `ast-photo-${gameId}`,
      photoSha256: sha256Bytes(seeded.sheet), ageYears: 8, crop: null,
      style: { version: "board-matched-identity/v4", catalogSha256: catalog.sha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
  const render = vi.fn<LocalPatchHideDeps["render"]>(async ({ stylePng, requestKey }) => paintedOk(await paintedCrop(stylePng, hide), bill(`paint-${gameId}-${requestKey}`)));
  const deps = { renderPolicySha256: "f".repeat(64), render, readBoardArt: async () => source,
    judge: async () => { throw Error("Per-hide judge forbidden in v12"); } };
  expect((await runLocalPatchHide(c, deps, { gameId, board, hide })).state).toBe("generated");
  const judge = vi.fn(async (request: LocalPatchBoardJudgeRequest): Promise<LocalPatchBoardJudgeResult> => ({ verdict: null, verdicts: {},
    raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId, evidenceIds: localPatchHideEvidenceIds(h.hideId), verdict: GOOD_V12_VERDICT })) }),
    model: "gpt-5.6-sol", requestId: `single-${gameId}`, usage: { prompt_tokens: 1000, completion_tokens: 500 }, finishReason: "stop", wireFault: null, costUnknown: false }));
  const request = dualReviewer(gameId, id => longAnswer(id, 150, 150, 0));
  if (options.dual) await db.$transaction(tx => pinVisualReviewRelease(tx, gameId, DUAL_VISUAL_REVIEW_V3));
  const container = options.dual ? { ...c, visualReview: { request } } : c;
  const input = { gameId, sceneId: `gsc-${gameId}-${board.board}` };
  const row = () => db.targetVariantAsset.findFirstOrThrow({ where: { targetInstance: { gameScene: { gameId }, targetId: hide.targetId } } });
  const prepared = () => prepareLocalPatchBoardReview(container, input, { readBoardArt: deps.readBoardArt }, { playerReview: true });
  const runOnce = () => reviewLocalPatchBoard(container, input, { judge, readBoardArt: deps.readBoardArt, fence: async () => {} });
  const run = async () => {
    const first = await runOnce();
    return first.reason === "Quality receipt retained; independent anatomy review is next" ? runOnce() : first;
  };
  return { gameId, board, hide, row, render, judge, request, prepared, run, runOnce, container, input, seeded };
}

describe("authored v4 return survives the real service path without changing legacy contracts", () => {
  it.each([false, true])("renders, reconstructs exact joins and publishes under dual=%s", async dual => {
    const s = await seed(`authored-valid-${dual}`, { dual });
    const rendered = await s.row(), receipt = JSON.parse(rendered.judgeJson!);
    expect(receipt.compositionVersion).toBe(AUTHORED_PATCH_COMPOSITION_VERSION);
    expect(receipt.authoredReturn.source).toMatchObject({ art: s.board.art, width: 3840, height: 2160 });
    expect(localPatchNeedsRecomposition(rendered, 12, true)).toBe(false);
    const prepared = await s.prepared();
    if (!prepared.ready) throw Error(prepared.reason);
    const local = localPatchReturnRegion(cropOf(s.hide), maskForHide(s.hide), s.hide.returnRect).local;
    expect(prepared.request.hides[0]!.returnedWindow).toEqual({ ...local, left: Math.min(192, s.hide.left) + local.left, top: Math.min(192, s.hide.top) + local.top });
    const asked = await dualQualityRequest(DUAL_VISUAL_REVIEW_V3, prepared.request);
    expect(asked.hides[0]!.joinDetails).toHaveLength(4);
    const questions = await dualReviewQuestionCandidates(s.container, { ...prepared, request: asked }, DUAL_VISUAL_REVIEW_V3);
    expect(questions.length).toBeGreaterThan(0);
    expect((await s.run()).reason).toBe("Other appearances await generation or review");
    const accepted = await s.row(), final = JSON.parse(accepted.judgeJson!);
    expect(final.boardReview.compositionVersion).toBe(AUTHORED_PATCH_COMPOSITION_VERSION);
    expect(final.boardReview.authoredReturn).toEqual(receipt.authoredReturn);
    expect(accepted.assetId).toBe(rendered.assetId);
    const binding = { gameId: s.gameId, sceneVersion: 12, hideId: s.hide.id, variantId: accepted.id, attempts: accepted.attempts,
      identityAssetId: prepared.identity.id, identitySha256: sha256Bytes(prepared.sheet), assetId: accepted.assetId!,
      imageSha256: final.judgedSha256, geometrySha256: localPatchPublicationGeometryHash(accepted), judgeJson: accepted.judgeJson };
    expect(await hasLocalPatchPublicationPolicy(c, binding)).toBe(true);
    const wrongReturn = { ...final, authoredReturn: { ...final.authoredReturn, source: { ...final.authoredReturn.source, sha256: "0".repeat(64) } } };
    expect(await hasLocalPatchPublicationPolicy(c, { ...binding, judgeJson: JSON.stringify(wrongReturn) })).toBe(false);
    if (dual) {
      expect(await db.$transaction(tx => allowedDualPublication(tx, { ...binding, judgeJson: JSON.stringify(wrongReturn) }))).toBe(false);
      expect(final.boardReview.dual.authoredReturn).toEqual(receipt.authoredReturn);
      for (const [question] of s.request.mock.calls) expect(question.prompt).toContain('"authoredReturn":{"version":"bounded-return/v4-authored-source-boundaries"');
      expect(await db.$transaction(tx => allowedDualPublication(tx, binding))).toBe(true);
      for (const value of [undefined, { ...receipt.authoredReturn, local: { ...local, left: local.left + 1 } }]) {
        const forged = { ...final, boardReview: { ...final.boardReview, dual: { ...final.boardReview.dual, authoredReturn: value } } };
        const input = { ...binding, judgeJson: JSON.stringify(forged) };
        expect(await db.$transaction(tx => allowedDualPublication(tx, input))).toBe(false);
        expect(await hasLocalPatchPublicationPolicy(c, input)).toBe(false);
        await expect(db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, input))).rejects.toThrow("publication quality policy");
      }
    }
    const prior = accepted.judgeJson;
    await s.run();
    expect((await s.row()).judgeJson).toBe(prior);
    expect(s.render).toHaveBeenCalledOnce();
    expect(dual ? s.request.mock.calls.length : s.judge.mock.calls.length).toBe(dual ? 2 : 1);
  }, 30_000);

  it("rejects missing, changed and forged v4 bindings before review purchase or asset mutation", async () => {
    const s = await seed("authored-invalid"), original = await s.row(), receipt = JSON.parse(original.judgeJson!);
    const originalAsset = await db.asset.findUniqueOrThrow({ where: { id: original.assetId! } });
    const ledger = () => boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId));
    const before = await ledger();
    const wrong = [undefined,
      { ...receipt.authoredReturn, source: { ...receipt.authoredReturn.source, sha256: "0".repeat(64) } },
      { ...receipt.authoredReturn, child: { ...receipt.authoredReturn.child, width: 1 } },
      { ...receipt.authoredReturn, crop: { ...receipt.authoredReturn.crop, left: 0 } },
      { ...receipt.authoredReturn, local: { ...receipt.authoredReturn.local, left: 0 } },
      { ...receipt.authoredReturn, region: { ...receipt.authoredReturn.region, top: 0 } }];
    for (const authoredReturn of wrong) {
      const judgeJson = JSON.stringify({ ...receipt, authoredReturn });
      await db.targetVariantAsset.update({ where: { id: original.id }, data: { judgeJson } });
      await expect(s.run()).rejects.toThrow("Authored return source, child envelope or window changed");
      expect((await s.row()).judgeJson).toBe(judgeJson);
    }
    await db.targetVariantAsset.update({ where: { id: original.id }, data: { judgeJson: original.judgeJson } });
    controls.inset++;
    await expect(s.run()).rejects.toThrow("Authored return source, child envelope or window changed");
    controls.inset--;
    expect(s.judge).not.toHaveBeenCalled(); expect(s.request).not.toHaveBeenCalled();
    expect(await ledger()).toEqual(before);
    expect(await db.asset.findUniqueOrThrow({ where: { id: original.assetId! } })).toEqual(originalAsset);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
  }, 30_000);

  it("refuses an alternate authored placement before a new image reservation or target mutation", async () => {
    const s = await seed("authored-placement"), row = await s.row();
    const before = await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId));
    const changed = { ...s.hide, returnRect: { ...s.hide.returnRect!, left: s.hide.returnRect!.left + 1, width: s.hide.returnRect!.width - 1 } };
    const render = vi.fn<LocalPatchHideDeps["render"]>(async () => { throw Error("Invalid placement reached painter"); });
    await expect(runLocalPatchHide(c, { renderPolicySha256: "f".repeat(64), render }, { gameId: s.gameId, board: s.board, hide: changed }))
      .rejects.toThrow("authored placement differs from its pinned source/window");
    expect(render).not.toHaveBeenCalled();
    expect(await s.row()).toEqual(row);
    expect(await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).toEqual(before);
  }, 30_000);

  it("plans a matching retained v4 answer for free, and refuses reuse with a different window", async () => {
    const s = await seed("authored-retained", { dual: true });
    await s.run();
    const row = await s.row(), receipt = JSON.parse(row.judgeJson!);
    // Model an older strict reader's unresolved row, with the exact paid raw
    // answers still in the real ledger/store. This changes no answer or bill.
    const unresolved = { ...receipt, verdict: null, wireFault: "schema",
      qualityDisposition: { state: "unresolved", faults: ["synthetic-older-reader"] },
      boardReview: { ...receipt.boardReview, dual: { ...receipt.boardReview.dual,
        continuity: { ...receipt.boardReview.dual.continuity, reader: CONTINUITY_READER_STRICT } } } };
    await db.targetVariantAsset.update({ where: { id: row.id }, data: { status: "FAILED", lastError: "quality-unresolved: synthetic older reader", judgeJson: JSON.stringify(unresolved) } });
    const before = await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId));
    const matching = await planLocalPatchEvidenceRecovery(s.container, s.gameId);
    expect(matching.hides.find(h => h.hideId === s.hide.id)?.plan).toBe("free-pass");
    unresolved.boardReview.dual.authoredReturn = { ...receipt.authoredReturn, local: { ...receipt.authoredReturn.local, left: 0 } };
    await db.targetVariantAsset.update({ where: { id: row.id }, data: { judgeJson: JSON.stringify(unresolved) } });
    const changed = await planLocalPatchEvidenceRecovery(s.container, s.gameId);
    expect(changed.hides.find(h => h.hideId === s.hide.id)?.plan).toBe("unverifiable");
    expect(await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).toEqual(before);
    expect(s.render).toHaveBeenCalledOnce(); expect(s.request).toHaveBeenCalledTimes(2);
  }, 30_000);

  it("keeps v3 receipts, recompose admission and paid question bindings free of v4 metadata", async () => {
    const s = await seed("authored-legacy", { authored: false, dual: true }), row = await s.row();
    expect(JSON.parse(row.judgeJson!)).toMatchObject({ compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION });
    expect(JSON.parse(row.judgeJson!).authoredReturn).toBeUndefined();
    expect(localPatchNeedsRecomposition(row, 12, true)).toBe(false);
    const prepared = await s.prepared();
    if (!prepared.ready) throw Error(prepared.reason);
    const questions = await dualReviewQuestionCandidates(s.container, prepared, DUAL_VISUAL_REVIEW_V3);
    expect(questions).toHaveLength(3);
    expect((await s.run()).reason).toBe("Other appearances await generation or review");
    const accepted = await s.row(), receipt = JSON.parse(accepted.judgeJson!);
    expect(receipt.boardReview.dual.authoredReturn).toBeUndefined();
    for (const [question] of s.request.mock.calls) expect(question.prompt).not.toContain('"authoredReturn"');
    const forged = { ...receipt, compositionVersion: AUTHORED_PATCH_COMPOSITION_VERSION };
    const binding = { ...publicationBinding(s.gameId, accepted), judgeJson: JSON.stringify(forged) };
    expect(await db.$transaction(tx => allowedDualPublication(tx, binding))).toBe(false);
    expect(await hasLocalPatchPublicationPolicy(c, binding)).toBe(false);
  }, 30_000);
});


/** A deliberate corruption probe updates a private synthetic retained envelope
 * and its checksum; it never uses the immutable store's write API to overwrite. */
async function alterPaidWire(gameId: string, requestKey: string, change: (wire: Record<string, unknown>) => void) {
  const key = retainedPurchaseKey(boardWizardWorldId(gameId), requestKey), row = await db.fileBlob.findUniqueOrThrow({ where: { key } });
  const envelope = JSON.parse(Buffer.from(row.data).toString()), wire = JSON.parse(Buffer.from(envelope.bytesBase64, "base64").toString());
  change(wire);
  const bytes = Buffer.from(JSON.stringify(wire));
  envelope.bytesBase64 = bytes.toString("base64"); envelope.payloadSha256 = retainedPayloadDigest(bytes);
  await db.fileBlob.update({ where: { key }, data: { data: new Uint8Array(Buffer.from(JSON.stringify(envelope))) } });
  return () => db.fileBlob.update({ where: { key }, data: { data: row.data } });
}

/** Enroll only after the already-paid quality/continuity questions. The normal
 * runtime must reuse those questions and dispatch its separate subject role. */
async function addSeparateSubject(s: Awaited<ReturnType<typeof seed>>) {
  const receipt = subjectUpgradeReceiptSchema.parse({ version: SUBJECT_UPGRADE_VERSION, gameId: s.gameId, ownerId: s.seeded.userId,
    subjectPolicy: SUBJECT_POLICY_VERSION, continuityTransport: BACKGROUND_REVIEW_TRANSPORT, reviewRecovery: SUBJECT_REVIEW_RECOVERY,
    dualReviewRelease: DUAL_VISUAL_REVIEW_V3, photoAssetId: `ast-photo-${s.gameId}`, photoSha256: sha256Bytes(s.seeded.sheet),
    identityAssetId: `ast-sheet-${s.gameId}`, identitySha256: sha256Bytes(s.seeded.sheet), ageYears: 8,
    operatorId: s.seeded.userId, actorType: "USER", authorizationSha256: "a".repeat(64), planSha256: "b".repeat(64), enrolledAt: new Date().toISOString() });
  await db.auditLog.create({ data: { id: subjectUpgradeAuditId(s.gameId), actorType: receipt.actorType, actorId: receipt.operatorId,
    action: SUBJECT_UPGRADE_ACTION, entityType: "Game", entityId: s.gameId, metaJson: JSON.stringify(receipt) } });
  const original = s.request.getMockImplementation()!;
  s.request.mockImplementation(async (question, timeoutMs) => {
    const reply = await original(question, timeoutMs);
    if (!question.prompt.includes(SUBJECT_POLICY_V2)) return reply;
    const observed = { status: "pass", observation: "The synthetic face, hair and age match the supplied authority." };
    return { ...reply, raw: JSON.stringify({ hideId: s.hide.id, subjectPolicy: SUBJECT_POLICY_V2,
      checks: { photoLikeness: observed, canonicalAgreement: observed, faceVisible: observed,
        perceivedAge: { ...observed, estimatedMinYears: 7, estimatedMaxYears: 9 }, requiredWardrobe: { ...observed, status: "not-required" } },
      appearance: { head: "three-quarter", expression: "focused", engagement: "acting", portraitCopy: false }, faults: [] }) };
  });
  await s.run();
  const row = await s.row(), proof = JSON.parse(row.judgeJson!).boardReview.dual;
  expect(proof.subject).toBeTruthy();
  expect(proof.subject.requestKey).not.toBe(proof.quality.requestKey);
  expect(s.request).toHaveBeenCalledTimes(3);
}

describe("authored v4 immutable paid composition attestation", () => {
  it.each([false, true])("rejects transplanted catalog windows while old paid questions remain unchanged, dual=%s", async dual => {
    const s = await seed(`authored-transplant-${dual}`, { dual }); await s.run();
    const row = await s.row(), receipt = JSON.parse(row.judgeJson!);
    const prepared = await s.prepared(); if (!prepared.ready) throw Error(prepared.reason);
    const original = { gameId: s.gameId, sceneVersion: 12, hideId: s.hide.id, variantId: row.id, attempts: row.attempts,
      identityAssetId: prepared.identity.id, identitySha256: sha256Bytes(prepared.sheet), assetId: row.assetId!,
      imageSha256: receipt.judgedSha256, geometrySha256: localPatchPublicationGeometryHash(row), judgeJson: row.judgeJson };
    expect(await hasLocalPatchPublicationPolicy(c, original)).toBe(true);
    const questions = s.request.mock.calls.map(([q]) => prepareVisualReview(q).fingerprint), before = await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId));
    controls.inset++;
    const board = localPatchBoardsForVersion(12).find(b => b.board === s.board.board)!, hide = board.hides.find(h => h.id === s.hide.id)!;
    const changed = expectedAuthoredLocalPatchReturn(board, hide, 12)!;
    const altered = { ...receipt, authoredReturn: changed, boardReview: { ...receipt.boardReview, authoredReturn: changed,
      ...(dual ? { dual: { ...receipt.boardReview.dual, authoredReturn: changed } } : {}) } };
    const input = { ...original, judgeJson: JSON.stringify(altered) };
    if (dual) expect(await db.$transaction(tx => allowedDualPublication(tx, input))).toBe(false);
    await expect(db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, input))).rejects.toThrow("publication quality policy");
    expect(await hasLocalPatchPublicationPolicy(c, input)).toBe(false);
    expect(s.request.mock.calls.map(([q]) => prepareVisualReview(q).fingerprint)).toEqual(questions);
    expect(await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).toEqual(before);
    expect(s.render).toHaveBeenCalledOnce();
  }, 30_000);

  it.each(["quality", "continuity", "subject"] as const)("requires immutable %s attestation; missing/tampered answers cannot publish or buy another role", async role => {
    const s = await seed(`authored-attest-${role}`, { dual: true }); await s.run();
    if (role === "subject") await addSeparateSubject(s);
    const row = await s.row(), receipt = JSON.parse(row.judgeJson!), proof = receipt.boardReview.dual, binding = publicationBinding(s.gameId, row);
    const expected = authoredLocalPatchReviewBinding({ ...binding, authoredReturn: receipt.authoredReturn })!;
    const stage = proof[role], stageRole = role === "continuity" ? "head-continuity" as const : "scene-quality" as const;
    expect(await verifiedDualStage(db, boardWizardWorldId(s.gameId), stage, stageRole, { authoredReviewBinding: expected })).toBeTruthy();
    const before = await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId)), calls = s.request.mock.calls.length;
    for (const value of [undefined, "0".repeat(64)]) {
      const restore = await alterPaidWire(s.gameId, stage.requestKey, wire => { if (value === undefined) delete wire.authoredReviewBinding; else wire.authoredReviewBinding = value; });
      try {
        expect(await verifiedDualStage(db, boardWizardWorldId(s.gameId), stage, stageRole, { authoredReviewBinding: expected })).toBeNull();
        expect(await db.$transaction(tx => allowedDualPublication(tx, binding))).toBe(false);
        expect(await hasLocalPatchPublicationPolicy(c, binding)).toBe(false);
        await expect(db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, binding))).rejects.toThrow("publication quality policy");
        await expect(s.run()).rejects.toThrow("retained authored review differs");
      } finally { await restore(); }
    }
    expect(await hasLocalPatchPublicationPolicy(c, binding)).toBe(true);
    expect(s.request).toHaveBeenCalledTimes(calls);
    expect(await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).toEqual(before);
  }, 45_000);

  it("refuses free rereading when only the mutable v4 proof keeps its binding", async () => {
    const s = await seed("authored-free-attest", { dual: true }); await s.run();
    const row = await s.row(), receipt = JSON.parse(row.judgeJson!);
    const unresolved = { ...receipt, verdict: null, wireFault: "schema", qualityDisposition: { state: "unresolved", faults: ["synthetic-older-reader"] },
      boardReview: { ...receipt.boardReview, dual: { ...receipt.boardReview.dual,
        continuity: { ...receipt.boardReview.dual.continuity, reader: CONTINUITY_READER_STRICT } } } };
    await db.targetVariantAsset.update({ where: { id: row.id }, data: { status: "FAILED", lastError: "quality-unresolved: synthetic older reader", judgeJson: JSON.stringify(unresolved) } });
    const before = await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId));
    const restore = await alterPaidWire(s.gameId, receipt.boardReview.dual.continuity.requestKey, wire => { delete wire.authoredReviewBinding; });
    try { expect((await planLocalPatchEvidenceRecovery(s.container, s.gameId)).hides.find(h => h.hideId === s.hide.id)?.plan).toBe("unverifiable"); }
    finally { await restore(); }
    expect((await planLocalPatchEvidenceRecovery(s.container, s.gameId)).hides.find(h => h.hideId === s.hide.id)?.plan).toBe("free-pass");
    expect(await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).toEqual(before);
    expect(s.request).toHaveBeenCalledTimes(2);
  }, 30_000);

  it("keeps legacy retained bytes free of authored attestations", async () => {
    const s = await seed("authored-legacy-attest", { authored: false, dual: true }); await s.run();
    const row = await s.row(), proof = JSON.parse(row.judgeJson!).boardReview.dual;
    for (const stage of [proof.quality, proof.continuity]) {
      const kept = await new PrismaRetainedPurchaseStore(db).get(boardWizardWorldId(s.gameId), stage.requestKey);
      expect(Object.hasOwn(JSON.parse(kept!.bytes.toString()), "authoredReviewBinding")).toBe(false);
      const call = s.request.mock.calls.findIndex(([q]) => prepareVisualReview(q).fingerprint === stage.fingerprint);
      const reply = await s.request.mock.results[call]!.value;
      expect(kept!.bytes.equals(Buffer.from(JSON.stringify({ ...reply, policy: stage.policy, fingerprint: stage.fingerprint })))).toBe(true);
      expect(await verifiedDualStage(db, boardWizardWorldId(s.gameId), stage, stage === proof.quality ? "scene-quality" : "head-continuity")).toBeTruthy();
    }
  }, 30_000);
});


describe("authored v4 attestation cannot be detached from its candidate", () => {
  it("refuses a grouped single-review pass without its paid attestation", async () => {
    const s = await seed("authored-single-attest"); await s.run();
    const row = await s.row(), receipt = JSON.parse(row.judgeJson!), prepared = await s.prepared();
    if (!prepared.ready) throw Error(prepared.reason);
    const input = { gameId: s.gameId, sceneVersion: 12, hideId: s.hide.id, variantId: row.id, attempts: row.attempts,
      identityAssetId: prepared.identity.id, identitySha256: sha256Bytes(prepared.sheet), assetId: row.assetId!, imageSha256: receipt.judgedSha256,
      geometrySha256: localPatchPublicationGeometryHash(row), judgeJson: row.judgeJson };
    const before = await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId));
    for (const value of [undefined, [{ hideId: s.hide.id, binding: "0".repeat(64) }]]) {
      const restore = await alterPaidWire(s.gameId, receipt.boardReview.requestKey, wire => {
        if (value === undefined) delete wire.authoredReviewBindings; else wire.authoredReviewBindings = value;
      });
      try {
        expect(await hasLocalPatchPublicationPolicy(c, input)).toBe(false);
        await expect(db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, input))).rejects.toThrow("publication quality policy");
        await expect(s.run()).rejects.toThrow("retained authored board review differs");
      } finally { await restore(); }
    }
    expect(await hasLocalPatchPublicationPolicy(c, input)).toBe(true);
    expect(s.judge).toHaveBeenCalledOnce();
    expect(await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).toEqual(before);
  }, 30_000);

  it("rejects substituted image, tap geometry or identity copied into every mutable proof field", async () => {
    const s = await seed("authored-candidate-attest", { dual: true }); await s.run();
    const row = await s.row(), receipt = JSON.parse(row.judgeJson!), original = publicationBinding(s.gameId, row);
    for (const field of ["imageSha256", "geometrySha256", "identitySha256"] as const) {
      const changed = "0".repeat(64), input = { ...original, [field]: changed };
      input.judgeJson = JSON.stringify({ ...receipt,
        ...(field === "imageSha256" ? { judgedSha256: changed } : field === "geometrySha256" ? { geometrySha256: changed } : {}),
        boardReview: { ...receipt.boardReview, dual: { ...receipt.boardReview.dual, [field]: changed } } });
      expect(await db.$transaction(tx => allowedDualPublication(tx, input))).toBe(false);
      await expect(db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, input))).rejects.toThrow("publication quality policy");
    }
    expect(await hasLocalPatchPublicationPolicy(c, original)).toBe(true);
    expect(s.request).toHaveBeenCalledTimes(2);
  }, 30_000);
});
