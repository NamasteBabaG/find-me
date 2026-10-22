import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { BackgroundReviewState, BackgroundReviewTransport } from "../../../infra/generation/types";
import { retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { SOURCE_NEIGHBOR_ANSWER_VERSION, SOURCE_NEIGHBOR_BUNDLE_VERSION, type SourceNeighborAnswer, type SourceNeighborContract } from "../../../domain/scene/local-patch-source-neighbors";
import { SUBJECT_QUALITY_BUNDLE_VERSION } from "../../../domain/generation/subject-quality-bundle";
import { SUBJECT_POLICY_V2, SUBJECT_READER_V2 } from "../../../domain/generation/subject-policy";
import type { SourceNeighborQualityBundleBinding } from "../../../domain/generation/source-neighbor-quality-bundle";
import { boardsOfWorlds } from "../../world-catalog.service";
import { sceneBySlug } from "../../scene-catalog.service";
import type { Container } from "../../container";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { readShippedBoardArt, runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import { prepareLocalPatchBoardReview, reviewLocalPatchBoard } from "../local-patch-board-review";
import { localPatchHideEvidenceIds } from "../local-patch-judge";
import { pinVisualReviewRelease, DUAL_VISUAL_REVIEW_V3 } from "../visual-review-release";
import { LOCAL_PATCH_LEAN_RELEASE, pinLeanRelease } from "../lean-release";
import { enrollLeanWorld } from "../lean-enrollment";
import { pinSourcePlacementRelease, resolveLocalPatchBoardsForGame, sourcePlacementReleaseAuditId } from "../source-placement-release";
import { buyDualLocalPatchReview, dualQualityQuestion, withSourceNeighborQualityQuestion } from "../local-patch-dual-review";
import { readQualityStage, readContinuityStage, readSourceNeighborQualityStage, sourceNeighborQualityEvidence, subjectStageRaw } from "../local-patch-dual-evidence";
import { allowedDualPublication } from "../local-patch-dual-publication";
import { hasLocalPatchPublicationPolicy, recordLocalPatchPublicationPolicy } from "../local-patch-publication-policy";
import { subjectPlanOfHide, subjectPlanSha256, subjectUpgradeOf } from "../subject-enrollment";
import { prepareVisualReview } from "../visual-review";
import { leanReviewPolicy } from "../../../domain/generation/visual-review-policy";
import { retainedPayloadDigest } from "../paid-operation";
import { planLocalPatchEvidenceRecovery } from "../local-patch-evidence-plan";
import { CONTINUITY_READER_STRICT } from "../../../domain/scene/local-patch-body-continuity";
import { sha256Bytes } from "../fixed-sprite";
import { bill, paintedCrop, paintedOk, seedApprovedGame } from "./local-patch-fixtures";
import { GOOD_V12_VERDICT, boundHide, longAnswer, publicationBinding } from "./local-patch-dual-fixtures";

const settings = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", LOCAL_PATCH_PROMPT_RELEASE: "v19",
  LOCAL_PATCH_PLAYER_REVIEW: "on", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: settings.testers }), flag: () => false, adminEmails: () => [] }));

let directory: string, db: PrismaClient, c: Container, source: Buffer;
const journey = new Set(boardsOfWorlds(["journey"]));
const boards = localPatchBoardsForVersion(12).filter(b => journey.has(b.board));
const baseBoard = boards.find(b => b.board === "greatwall")!;
type Mode = "duplicated" | "remnants" | "missing" | "ambiguous" | "wrong-binding" | "plain" | "replaced-whole" | "subject-fail" | "quality-fail" | "continuity-fail";
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-source-neighbor-runtime-")));
  db = new PrismaClient({ datasources: { db: { url: "file:" + path.join(directory, "test.sqlite").replaceAll("\\", "/") } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db) } as unknown as Container;
  source = await readShippedBoardArt(baseBoard.art, sceneBySlug(baseBoard.board, 12).art.sha256!);
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live calls forbidden in source-neighbor runtime regression"); }));
}, 180_000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-source-neighbor-runtime-"))
    rmSync(directory, { recursive: true });
});

function answer(prompt: string, mode: Mode): string {
  const hideId = boundHide(prompt).hideId;
  if (!prompt.includes(SOURCE_NEIGHBOR_BUNDLE_VERSION)) return mode === "continuity-fail"
    ? longAnswer(hideId, 150, 150, 0, { state: "broken", faults: [{ kind: "hard-cut", where: "At the lower join a torso stops in a straight cut." }] })
    : longAnswer(hideId, 150, 150, 0);
  const line = prompt.split("\n").find(l => l.startsWith("AUTHORITATIVE SOURCE NEIGHBORS: "))!;
  const { contract } = JSON.parse(line.slice("AUTHORITATIVE SOURCE NEIGHBORS: ".length)) as { contract: SourceNeighborContract };
  const binding = JSON.parse(/Wrapper binding metadata \(do not add policy\/reader fields to the answer\): (\{[^\n]+\})\./.exec(prompt)![1]!) as SourceNeighborQualityBundleBinding;
  const observed = (status: string) => ({ status, observation: "The synthetic face and native scene evidence support this observation." });
  const verdict = mode === "quality-fail" ? { ...GOOD_V12_VERDICT, scaleRight: "fail", verdict: "fail",
    faults: [{ check: "scaleRight", where: "The child is twice the size of people standing at the same depth." }] } : GOOD_V12_VERDICT;
  const assessment = { version: SUBJECT_QUALITY_BUNDLE_VERSION,
    quality: { hides: [{ hideId, evidenceIds: localPatchHideEvidenceIds(hideId), verdict }] },
    subject: { hideId, subjectPolicy: SUBJECT_POLICY_V2, checks: {
      photoLikeness: observed(mode === "subject-fail" ? "fail" : "pass"), canonicalAgreement: observed("pass"), faceVisible: observed("pass"),
      perceivedAge: { ...observed("pass"), estimatedMinYears: 7, estimatedMaxYears: 9 }, requiredWardrobe: observed("not-required") },
      appearance: { head: "three-quarter", expression: "focused", engagement: "watching", portraitCopy: false },
      faults: mode === "subject-fail" ? [{ check: "photoLikeness", where: "The drawn child has another face shape and straight hair." }] : [] } };
  const sourceNeighbors: SourceNeighborAnswer = { version: SOURCE_NEIGHBOR_ANSWER_VERSION, contractSha256: binding.contractSha256,
    candidateSha256: mode === "wrong-binding" ? "0".repeat(64) : binding.candidateSha256,
    neighbors: contract.neighbors.map((n, i) => ({ sourceId: n.sourceId, outcome: i === 0 ? "replaced-whole" : "preserved",
      status: "pass", after: [{ ref: "person-" + i, rect: n.head }], remnants: "none", occluder: null,
      observation: "One coherent source-corresponding person with no original remnant." })) };
  if (mode === "duplicated") sourceNeighbors.neighbors[0]!.after.push({ ref: "shifted-copy",
    rect: { ...sourceNeighbors.neighbors[0]!.after[0]!.rect, left: sourceNeighbors.neighbors[0]!.after[0]!.rect.left + 12 } });
  if (mode === "remnants") sourceNeighbors.neighbors[0]!.remnants = "present";
  if (mode === "ambiguous") sourceNeighbors.neighbors[1]!.after[0]!.rect = sourceNeighbors.neighbors[0]!.after[0]!.rect;
  if (mode === "plain") return JSON.stringify(assessment);
  return JSON.stringify({ version: SOURCE_NEIGHBOR_BUNDLE_VERSION, assessment, ...(mode === "missing" ? {} : { sourceNeighbors }) });
}

function provider(mode: Mode) {
  const requests: { responseId: string; prompt: string; body: unknown }[] = [];
  const transport: BackgroundReviewTransport = { namespace: "openai:find-me-existing",
    create: async body => {
      const prompt = (body.input as { content: { text?: string }[] }[])[0]!.content[0]!.text!;
      const responseId = "resp_source_" + requests.length;
      requests.push({ responseId, prompt, body }); return { responseId };
    },
    retrieve: async (responseId): Promise<BackgroundReviewState> => {
      const request = requests.find(r => r.responseId === responseId)!;
      return { status: "completed", reading: { responseId, raw: answer(request.prompt, mode),
        usage: { input_tokens: 2000, output_tokens: 800 }, model: "gpt-6.1-sol", finishReason: "stop", serviceTier: "flex" } };
    }, cancel: async () => {} };
  return { requests, transport };
}

/** One appearance in a real prospective nine-board world. Actual canonical public
 * source pixels, synthetic identity/painter/review providers, real ledgers and gates. */
async function seed(gameId: string, mode: Mode) {
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, status: "DRAFT", styleVersion: "local-patch-world-v1",
    scenes: boards.map(b => ({ slug: b.board, version: 12 })) });
  settings.testers.push(seeded.email);
  await db.$transaction(async tx => { await pinVisualReviewRelease(tx, gameId, DUAL_VISUAL_REVIEW_V3);
    await pinLeanRelease(tx, gameId, LOCAL_PATCH_LEAN_RELEASE); await pinSourcePlacementRelease(tx, gameId); });
  await db.game.update({ where: { id: gameId }, data: { status: "TARGETS_GENERATING" } });
  await db.generationJob.create({ data: { id: "job_" + gameId, gameId, status: "QUEUED" } });
  await db.order.create({ data: { id: "ord-" + gameId, gameId, userId: seeded.userId, provider: "mock", packageTier: "ONE_WORLD",
    amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  await c.storage.put("private/photo-" + gameId + ".jpg", seeded.sheet, "image/png");
  const catalog = await readBoardConditionedCatalog();
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
    write: work => db.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: "req-identity-" + gameId,
      body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop",
        message: { content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Controlled identity" }) } }] } }) } },
    { gameId, identityAssetId: "ast-sheet-" + gameId, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: 12,
      provenance: { promptVersion: "character-v6-painted-identity-geometry", quality: "medium", photoAssetId: "ast-photo-" + gameId,
        photoSha256: sha256Bytes(seeded.sheet), ageYears: 8, crop: null,
        style: { version: "board-matched-identity/v4", catalogSha256: catalog.sha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
  const fake = provider(mode), request = vi.fn(async () => { throw Error("A lean world buys no synchronous review"); });
  const container = { ...c, visualReview: { request }, backgroundReview: fake.transport } as Container;
  expect(await enrollLeanWorld(container, gameId, async () => {})).toEqual({ state: "enrolled" });
  const placementContext = await resolveLocalPatchBoardsForGame(db, gameId, 12);
  const board = placementContext.boards.find(b => b.board === "greatwall")!, hide = board.hides.find(h => h.id === "greatwall-v12-2")!;
  const render = vi.fn<LocalPatchHideDeps["render"]>(async ({ stylePng, requestKey }) =>
    paintedOk(await paintedCrop(stylePng, hide), bill("paint-" + gameId + "-" + requestKey)));
  const deps = { renderPolicySha256: "f".repeat(64), render, readBoardArt: async () => source,
    judge: async () => { throw Error("Per-hide judge forbidden"); } };
  expect((await runLocalPatchHide(container, deps, { gameId, board, hide })).state).toBe("generated");
  const input = { gameId, sceneId: "gsc-" + gameId + "-greatwall" };
  const row = () => db.targetVariantAsset.findFirstOrThrow({ where: { targetInstance: { gameScene: { gameId }, targetId: hide.targetId } } });
  const prepared = () => prepareLocalPatchBoardReview(container, input, { readBoardArt: deps.readBoardArt }, { playerReview: true });
  const review = () => reviewLocalPatchBoard(container, input, { judge: async () => { throw Error("Single judge forbidden"); },
    readBoardArt: deps.readBoardArt, fence: async () => {} });
  const run = async () => {
    for (let i = 0; i < 8; i++) { await review(); if (JSON.parse((await row()).judgeJson!).boardReview?.dual) return; }
    throw Error("Synthetic review did not reach a decided or unresolved receipt");
  };
  return { gameId, seeded, fake, container, placementContext, board, hide, row, render, prepared, review, run, request };
}

describe("source-neighbor companion through actual review and publication", () => {
  it.each(["duplicated", "remnants"] as const)("routes all-pass quality beside source %s to neighbor repair", async mode => {
    const s = await seed("source-neighbor-defect-" + mode, mode); await s.run();
    const row = await s.row(), receipt = JSON.parse(row.judgeJson!);
    expect(receipt.verdict.neighborsIntact).toBe("fail");
    expect(receipt.verdict.faults).toEqual(expect.arrayContaining([expect.objectContaining({ check: "neighborsIntact",
      where: expect.stringContaining("SOURCE_NEIGHBOR " + mode) })]));
    expect(receipt.qualityDisposition.state).toBe("retry");
    expect(readSourceNeighborQualityStage(receipt.boardReview.dual.quality)).toMatchObject({ ok: true, sourceNeighbors: { disposition: "repair" } });
    expect(row.attempts).toBe(1); expect(s.render).toHaveBeenCalledOnce(); expect(s.request).not.toHaveBeenCalled();
    expect(await db.$transaction(tx => allowedDualPublication(tx, publicationBinding(s.gameId, row)))).toBe(false);
  }, 60_000);

  it.each(["missing", "ambiguous", "wrong-binding", "plain"] as const)("keeps %s source evidence unresolved without repaint authority", async mode => {
    const s = await seed("source-neighbor-" + mode, mode); await s.run();
    const row = await s.row(), receipt = JSON.parse(row.judgeJson!);
    expect(receipt.verdict).toBeNull(); expect(receipt.qualityDisposition.state).toBe("unresolved");
    expect(receipt.evidenceAttempts.at(-1)).toMatchObject({ role: "quality", kind: "shape", code: expect.stringContaining("source-neighbor:") });
    expect(receipt.evidenceDiagnosis?.next).not.toBe("repair");
    expect(readQualityStage(receipt.boardReview.dual.quality, s.hide.id)).toBeNull();
    expect(row.attempts).toBe(1); expect(s.render).toHaveBeenCalledOnce();
    expect(await db.$transaction(tx => allowedDualPublication(tx, publicationBinding(s.gameId, row)))).toBe(false);
  }, 60_000);

  it("accepts coherent whole replacement only with the original quality, subject, continuity and paid bindings", async () => {
    const s = await seed("source-neighbor-clean", "replaced-whole"); await s.run();
    const row = await s.row(), receipt = JSON.parse(row.judgeJson!), proof = receipt.boardReview.dual, binding = publicationBinding(s.gameId, row);
    expect(receipt.qualityDisposition.state).toBe("acceptable");
    expect(await db.$transaction(tx => allowedDualPublication(tx, binding))).toBe(true);
    expect(await hasLocalPatchPublicationPolicy(c, binding)).toBe(true);
    expect(proof.subject).toMatchObject({ subjectPolicy: SUBJECT_POLICY_V2, reader: SUBJECT_READER_V2,
      planSha256: subjectPlanSha256(subjectPlanOfHide(s.hide.id)!) });
    expect(proof.subject.photoSha256).toBe((await subjectUpgradeOf(db, s.gameId))!.photoSha256);
    expect(proof.subject.raw).toBe(proof.quality.raw);
    expect(JSON.parse(subjectStageRaw(proof.subject)!)).toMatchObject({ hideId: s.hide.id, subjectPolicy: SUBJECT_POLICY_V2 });
    expect(s.fake.requests).toHaveLength(2);
    const quality = s.fake.requests.find(r => r.prompt.includes(SOURCE_NEIGHBOR_BUNDLE_VERSION))!;
    const continuity = s.fake.requests.find(r => !r.prompt.includes(SOURCE_NEIGHBOR_BUNDLE_VERSION))!;
    expect(quality.prompt).toContain('"left":1232,"top":602,"width":896,"height":1152');
    expect(quality.prompt).toContain("native full-board pixels");
    expect(continuity.prompt).not.toContain("AUTHORITATIVE SOURCE NEIGHBORS");
    expect(proof.quality.policy).toEqual(leanReviewPolicy("scene-quality", "flex"));
    expect(proof.continuity.policy).toEqual(leanReviewPolicy("head-continuity", "flex"));
    expect(s.render).toHaveBeenCalledOnce(); expect(s.request).not.toHaveBeenCalled();
  }, 60_000);

  it.each(["subject-fail", "quality-fail", "continuity-fail"] as const)("a source pass cannot waive an original %s gate", async mode => {
    const s = await seed("source-neighbor-original-" + mode, mode); await s.run();
    const row = await s.row(), receipt = JSON.parse(row.judgeJson!), proof = receipt.boardReview.dual;
    expect(readSourceNeighborQualityStage(proof.quality)).toMatchObject({ ok: true, sourceNeighbors: { disposition: "pass" } });
    expect(receipt.qualityDisposition.state).toBe("retry");
    if (mode === "quality-fail") expect(readQualityStage(proof.quality, s.hide.id)?.scaleRight).toBe("fail");
    if (mode === "subject-fail") expect(JSON.parse(subjectStageRaw(proof.subject)!).checks.photoLikeness.status).toBe("fail");
    if (mode === "continuity-fail") expect(readContinuityStage(proof.continuity, s.hide.id, DUAL_VISUAL_REVIEW_V3)).toMatchObject({ ok: true });
    expect(await db.$transaction(tx => allowedDualPublication(tx, publicationBinding(s.gameId, row)))).toBe(false);
    expect(await hasLocalPatchPublicationPolicy(c, publicationBinding(s.gameId, row))).toBe(false);
    expect(s.render).toHaveBeenCalledOnce();
  }, 60_000);

  it("rejects source metadata, raw, manifest and retained-role transplants at both publication gates", async () => {
    const s = await seed("source-neighbor-transplant", "replaced-whole"); await s.run();
    const row = await s.row(), receipt = JSON.parse(row.judgeJson!), original = publicationBinding(s.gameId, row);
    const refused = async (judgeJson: string) => {
      const binding = { ...original, judgeJson };
      expect(await db.$transaction(tx => allowedDualPublication(tx, binding))).toBe(false);
      expect(await hasLocalPatchPublicationPolicy(c, binding)).toBe(false);
      await expect(db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, binding))).rejects.toThrow("publication quality policy");
    };
    for (const field of ["manifestSha256", "contract", "binding"] as const) {
      const changed = JSON.parse(row.judgeJson!);
      if (field === "manifestSha256") changed.boardReview.dual.quality.sourceNeighbors[field] = "0".repeat(64);
      else if (field === "contract") changed.boardReview.dual.quality.sourceNeighbors.contract.neighbors[0].head.left++;
      else changed.boardReview.dual.quality.sourceNeighbors.binding.contractSha256 = "0".repeat(64);
      await refused(JSON.stringify(changed));
    }
    const plain = JSON.parse(row.judgeJson!); plain.boardReview.dual.quality.raw = JSON.stringify(JSON.parse(plain.boardReview.dual.quality.raw).assessment);
    await refused(JSON.stringify(plain));
    const noMetadata = JSON.parse(row.judgeJson!); delete noMetadata.boardReview.dual.quality.sourceNeighbors;
    await refused(JSON.stringify(noMetadata));
    const pinId = sourcePlacementReleaseAuditId(s.gameId), pin = await db.auditLog.findUniqueOrThrow({ where: { id: pinId } });
    const pinValue = JSON.parse(pin.metaJson!); pinValue.manifestSha256 = "0".repeat(64);
    await db.auditLog.update({ where: { id: pinId }, data: { metaJson: JSON.stringify(pinValue) } });
    try { await refused(row.judgeJson!); } finally { await db.auditLog.update({ where: { id: pinId }, data: { metaJson: pin.metaJson } }); }
    for (const role of ["quality", "continuity"] as const) {
      const key = retainedPurchaseKey(boardWizardWorldId(s.gameId), receipt.boardReview.dual[role].requestKey);
      const blob = await db.fileBlob.findUniqueOrThrow({ where: { key } }), envelope = JSON.parse(Buffer.from(blob.data).toString());
      const wire = JSON.parse(Buffer.from(envelope.bytesBase64, "base64").toString()); delete wire.authoredReviewBinding;
      const bytes = Buffer.from(JSON.stringify(wire)); envelope.bytesBase64 = bytes.toString("base64"); envelope.payloadSha256 = retainedPayloadDigest(bytes);
      await db.fileBlob.update({ where: { key }, data: { data: new Uint8Array(Buffer.from(JSON.stringify(envelope))) } });
      try { await refused(row.judgeJson!); } finally { await db.fileBlob.update({ where: { key }, data: { data: blob.data } }); }
    }
    expect(await hasLocalPatchPublicationPolicy(c, original)).toBe(true);
    expect(s.fake.requests).toHaveLength(2);
  }, 60_000);

  it("binds the dry-run retained reader to actual companion metadata instead of old plain quality", async () => {
    const s = await seed("source-neighbor-retained-plan", "replaced-whole"); await s.run();
    const row = await s.row(), receipt = JSON.parse(row.judgeJson!);
    const unresolved = { ...receipt, verdict: null, wireFault: "schema", qualityDisposition: { state: "unresolved", faults: ["synthetic-old-reader"] },
      boardReview: { ...receipt.boardReview, dual: { ...receipt.boardReview.dual, continuity: { ...receipt.boardReview.dual.continuity, reader: CONTINUITY_READER_STRICT } } } };
    await db.targetVariantAsset.update({ where: { id: row.id }, data: { status: "FAILED", lastError: "quality-unresolved: synthetic old reader", judgeJson: JSON.stringify(unresolved) } });
    const before = await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId));
    const good = await planLocalPatchEvidenceRecovery(s.container, s.gameId);
    expect(good.hides.find(h => h.hideId === s.hide.id)?.plan).toBe("free-pass");
    for (const plain of [false, true]) {
      const forged = JSON.parse(JSON.stringify(unresolved));
      if (plain) forged.boardReview.dual.quality.raw = JSON.stringify(JSON.parse(forged.boardReview.dual.quality.raw).assessment);
      else delete forged.boardReview.dual.quality.sourceNeighbors;
      await db.targetVariantAsset.update({ where: { id: row.id }, data: { judgeJson: JSON.stringify(forged) } });
      const bad = await planLocalPatchEvidenceRecovery(s.container, s.gameId);
      expect(bad.hides.find(h => h.hideId === s.hide.id)?.plan).toBe("unverifiable");
    }
    expect(await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).toEqual(before);
    expect(s.fake.requests).toHaveLength(2); expect(s.render).toHaveBeenCalledOnce();
  }, 60_000);
  it("keeps the historical unwrapped question exact and refuses an oversized new question before reservation", async () => {
    const s = await seed("source-neighbor-admission", "replaced-whole"), p = await s.prepared();
    if (!p.ready) throw Error(p.reason);
    const binding = { hideId: s.hide.id, imageSha256: p.entries[0]!.imageSha256, geometrySha256: p.entries[0]!.geometrySha256,
      identitySha256: sha256Bytes(p.sheet) };
    const ordinary = dualQualityQuestion(p.request, binding, 1);
    expect(withSourceNeighborQualityQuestion(ordinary, undefined)).toBe(ordinary);
    const uncovered = p.placementContext.boards.flatMap(b => b.hides).filter(h => h.id !== s.hide.id);
    expect(uncovered).toHaveLength(53);
    for (const hide of uncovered) {
      const absent = sourceNeighborQualityEvidence(p.placementContext, hide.id, binding.imageSha256, {});
      expect(absent).toBeUndefined(); expect(withSourceNeighborQualityQuestion(ordinary, absent)).toBe(ordinary);
    }
    const metadata = sourceNeighborQualityEvidence(p.placementContext, s.hide.id, binding.imageSha256, JSON.parse((await s.row()).judgeJson!))!;
    expect(() => withSourceNeighborQualityQuestion(ordinary, metadata, { left: 0, top: 0, width: 2, height: 2 }))
      .toThrow("all registered heads");
    const before = await p.budget.audit(p.worldId);
    const huge = { ...p, request: { ...p.request, prompt: "x".repeat(1_500_000) } };
    // A synthetic long expectation is part of the original question, rather than
    // a trimmed source wrapper or a new higher reserve.
    huge.request.hides = huge.request.hides.map(h => ({ ...h, expectation: { ...h.expectation!, support: "x".repeat(1_500_000) } }));
    const result = await buyDualLocalPatchReview(s.container, huge, { fence: async () => {} });
    expect(result.kind).toBe("waiting");
    if (result.kind === "waiting") expect(result.outcome).toMatchObject({ state: "held", costCents: 0 });
    expect(await p.budget.audit(p.worldId)).toEqual(before);
    expect(s.fake.requests).toHaveLength(0);
    expect(prepareVisualReview(ordinary).fingerprint).toBe(ordinary.fingerprint);
  }, 60_000);
});
