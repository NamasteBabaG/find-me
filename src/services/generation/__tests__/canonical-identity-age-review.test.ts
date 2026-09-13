import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Container } from "../../container";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { MockPaymentProvider } from "../../../infra/payment/mock";
import { MockAvatarProvider, NoopFaceDetector } from "../../../infra/generation/mock";
import { NoPatchJudge } from "../../../infra/generation/judge";
import { NoopAnalytics } from "../../../infra/analytics/console";
import { InlineJobRunner } from "../../../infra/jobs/inline";
import { retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { prepareLocalPatchIdentityReferences } from "../local-patch-identity-reference";
import { sha256Bytes } from "../fixed-sprite";
import { reviewCanonicalIdentityAge, readCanonicalIdentityAgeReview, CANONICAL_IDENTITY_AGE_REVIEW_KEY,
  CANONICAL_IDENTITY_AGE_REVIEW_RESERVE_MICRO_USD, type CanonicalIdentityAgeReviewInput,
  type CanonicalIdentityAgeBinding, type CanonicalIdentityAgeReviewDeps } from "../canonical-identity-age-review";
import { clearWorld, seedApprovedGame, identitySheet, bill } from "./local-patch-fixtures";
import type { LocalPatchJudgeResult } from "../local-patch-judge";

const envState = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: envState.testers }), flag: () => false }));
const GAME = "game-canonical-age-review";
let dir: string, url: string, db: PrismaClient, c: Container, input: CanonicalIdentityAgeReviewInput;
const noNetwork = vi.fn(async () => { throw new Error("No live network"); });
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-canonical-age-")));
  url = `file:${path.join(dir, "test.sqlite").split(path.sep).join("/")}`;
  db = new PrismaClient({ datasources: { db: { url } } }); await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-age",
    payment: new MockPaymentProvider("http://localhost:3000", "synthetic"), avatars: new MockAvatarProvider(),
    judge: new NoPatchJudge(), faces: new NoopFaceDetector(), analytics: new NoopAnalytics(), jobs: new InlineJobRunner(),
    email: { id: "console", send: async () => { throw new Error("Review must not send mail"); } }, adminEmails: [] };
  const canonicalSheet = await identitySheet(), { identityPng: portrait } = await prepareLocalPatchIdentityReferences(canonicalSheet, 9);
  input = { gameId: GAME, identityAssetId: "identity-canonical-new", canonicalSheet, portrait,
    sheetSha256: sha256Bytes(canonicalSheet), portraitSha256: sha256Bytes(portrait), sourceAgeYears: 8, targetAgeYears: 5,
    parentAuthorizationSha256: "a".repeat(64), sourceIdentityProofSha256: "b".repeat(64) };
}, 180000);
beforeEach(async () => {
  await clearWorld(db); noNetwork.mockClear(); vi.stubGlobal("fetch", noNetwork);
  const seeded = await seedApprovedGame(c, db, { gameId: GAME, approved: false, styleVersion: "local-patch-world-v1",
    status: "PAID", withJob: true, scenes: [{ slug: "tokyo", version: 9 }] });
  envState.testers = [seeded.email];
});
afterAll(async () => { vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(dir) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-canonical-age-")) rmSync(dir, { recursive: true, force: true }); });
function binding(): CanonicalIdentityAgeBinding { const { canonicalSheet: _s, portrait: _p, ...meta } = input; return meta; }
const answer = { checks: { identity: "pass", faceAge: "pass", usableFace: "pass" }, reason: "The unchanged accepted illustrated face is complete and compatible with a five-year-old child; no photograph was reviewed." };
function reply(over: Partial<LocalPatchJudgeResult> = {}): LocalPatchJudgeResult {
  return { verdict: null, raw: JSON.stringify(answer), usage: { prompt_tokens: 1000, completion_tokens: 100 }, requestId: "req-canonical-age",
    model: "gpt-5.6-luna", finishReason: "stop", wireFault: null, costUnknown: false, ...over };
}
function deps(over: Partial<LocalPatchJudgeResult> = {}): CanonicalIdentityAgeReviewDeps & { judge: ReturnType<typeof vi.fn> } {
  return { fence: async tx => { const game = await tx.game.findUniqueOrThrow({ where: { id: GAME } }); if (game.deletedAt) throw new Error("deleted"); },
    judge: vi.fn(async () => reply(over)) };
}
describe("canonical-only age review: durable real ledger, no invented photo/identity charge", () => {
  it("reviews the exact canonical face and old sheet as distinct evidence, then replays with a fresh DB client without another call", async () => {
    const d = deps(), initial = await reviewCanonicalIdentityAge(c, input, d);
    expect(initial).toMatchObject({ state: "pass", replayed: false,
      sourceKind: "parent-accepted-canonical-drawing-no-source-photo", binding: { sourceAgeYears: 8, targetAgeYears: 5 },
      evidence: { model: "gpt-5.6-luna", costBasis: "conservative-upper-estimate" } });
    const wire = d.judge.mock.calls[0]![0];
    expect(wire.settings).toMatchObject({ model: "gpt-5.6-luna", effort: "low", maxOutputTokens: 1500 });
    expect(wire.images.map(sha256Bytes)).toEqual([input.portraitSha256, input.sheetSha256]);
    expect(wire.prompt).toContain("NOT original-photograph verification");
    expect(wire.prompt).toContain("NOT body-age authority");
    expect(wire.prompt).toContain("5-year-old child");
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try { const d2 = deps(), c2 = { ...c, db: fresh, storage: new DbStorage(fresh) };
      expect(await reviewCanonicalIdentityAge(c2, input, d2)).toMatchObject({ state: "pass", replayed: true });
      const before = await fresh.auditLog.findMany();
      expect(await readCanonicalIdentityAgeReview(c2, binding())).toMatchObject({ state: "pass", replayed: true, checks: answer.checks });
      expect(await fresh.auditLog.findMany()).toEqual(before); expect(d2.judge).not.toHaveBeenCalled();
    } finally { await fresh.$disconnect(); }
    expect(d.judge).toHaveBeenCalledTimes(1); expect(noNetwork).not.toHaveBeenCalled();
    expect(await db.targetVariantAsset.count()).toBe(0);
    expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(GAME), CANONICAL_IDENTITY_AGE_REVIEW_KEY))
      .toMatchObject({ state: "settled", scope: "judge", reserveMicroUsd: CANONICAL_IDENTITY_AGE_REVIEW_RESERVE_MICRO_USD });
  });
  it.each([["identity", "fail"], ["faceAge", "fail"], ["usableFace", "fail"],
    ["identity", "uncertain"], ["faceAge", "uncertain"], ["usableFace", "uncertain"]] as const)("%s=%s is blocked, not a silent accepted face", async (field, value) => {
    const raw = JSON.stringify({ ...answer, checks: { ...answer.checks, [field]: value } }), d = deps({ raw });
    expect(await reviewCanonicalIdentityAge(c, input, d)).toMatchObject({ state: "blocked", checks: { [field]: value } });
    expect(await readCanonicalIdentityAgeReview(c, binding())).toMatchObject({ state: "blocked" });
    expect(d.judge).toHaveBeenCalledTimes(1);
  });
  it("ignores a claimed pass with unusable structured evidence", async () => {
    expect(await reviewCanonicalIdentityAge(c, input, deps({ raw: JSON.stringify({ approved: true, reason: "fine" }) })))
      .toMatchObject({ state: "blocked", checks: null, wireFault: "schema" });
  });
  it("wrong model remains a retained, priced refusal", async () => {
    const d = deps({ model: "gpt-5.6-sol" });
    expect(await reviewCanonicalIdentityAge(c, input, d)).toMatchObject({ state: "blocked", wireFault: "wrong-model", evidence: { model: "gpt-5.6-sol" } });
    expect(await readCanonicalIdentityAgeReview(c, binding())).toMatchObject({ state: "blocked" });
  });
  it.each([{ usage: null, costUnknown: true }, { model: "unpriced-model", costUnknown: false }])("unknown bill stays held and retained without a second call: %j", async over => {
    const d = deps(over);
    expect(await reviewCanonicalIdentityAge(c, input, d)).toMatchObject({ state: "held" });
    expect(await db.fileBlob.findUnique({ where: { key: retainedPurchaseKey(boardWizardWorldId(GAME), CANONICAL_IDENTITY_AGE_REVIEW_KEY) } })).not.toBeNull();
    expect(await reviewCanonicalIdentityAge(c, input, d)).toMatchObject({ state: "held" });
    expect(await readCanonicalIdentityAgeReview(c, binding())).toMatchObject({ state: "held" });
    expect(d.judge).toHaveBeenCalledTimes(1);
  });
  it.each(["targetAgeYears", "parentAuthorizationSha256", "sourceIdentityProofSha256"] as const)("a changed %s cannot inherit the review or buy again", async field => {
    const d = deps(); await reviewCanonicalIdentityAge(c, input, d);
    const changed = { ...input, [field]: field === "targetAgeYears" ? 6 : "c".repeat(64) };
    expect(await reviewCanonicalIdentityAge(c, changed, d)).toMatchObject({ state: "held" });
    const { canonicalSheet: _s, portrait: _p, ...meta } = changed;
    await expect(readCanonicalIdentityAgeReview(c, meta)).rejects.toThrow("different canonical pixels, age or authority");
    expect(d.judge).toHaveBeenCalledTimes(1);
  });
  it("refuses changed pixels and a correctly hashed noncanonical portrait before spending", async () => {
    const wrong = await sharp(input.portrait).tint("red").png().toBuffer(), d = deps();
    await expect(reviewCanonicalIdentityAge(c, { ...input, portrait: wrong }, d)).rejects.toThrow("pixels changed");
    await expect(reviewCanonicalIdentityAge(c, { ...input, portrait: wrong, portraitSha256: sha256Bytes(wrong) }, d)).rejects.toThrow("top-left face");
    expect(d.judge).not.toHaveBeenCalled();
    expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(GAME), CANONICAL_IDENTITY_AGE_REVIEW_KEY)).toBeNull();
  });
  it("detects a retained receipt tampered after settlement", async () => {
    await reviewCanonicalIdentityAge(c, input, deps());
    const key = retainedPurchaseKey(boardWizardWorldId(GAME), CANONICAL_IDENTITY_AGE_REVIEW_KEY), row = await db.fileBlob.findUniqueOrThrow({ where: { key } });
    const envelope = JSON.parse(Buffer.from(row.data).toString()); envelope.evidence.amountMicroUsd += 1;
    await db.fileBlob.update({ where: { key }, data: { data: new Uint8Array(Buffer.from(JSON.stringify(envelope))) } });
    await expect(readCanonicalIdentityAgeReview(c, binding())).rejects.toThrow("matching retained result");
  });
  it("checks the wire's actual usage against the full matching bill, not just its usage id and amount", async () => {
    await reviewCanonicalIdentityAge(c, input, deps());
    const worldId = boardWizardWorldId(GAME), key = retainedPurchaseKey(worldId, CANONICAL_IDENTITY_AGE_REVIEW_KEY);
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } }), snapshot = JSON.parse(ledger.snapshotJson);
    const request = snapshot.requests.find((row: { requestKey: string }) => row.requestKey === CANONICAL_IDENTITY_AGE_REVIEW_KEY);
    request.evidence.rawUsage = { prompt_tokens: 2000, completion_tokens: 100 };
    await db.worldBudgetLedger.update({ where: { worldId }, data: { snapshotJson: JSON.stringify(snapshot) } });
    const row = await db.fileBlob.findUniqueOrThrow({ where: { key } }), envelope = JSON.parse(Buffer.from(row.data).toString());
    envelope.evidence = request.evidence;
    await db.fileBlob.update({ where: { key }, data: { data: new Uint8Array(Buffer.from(JSON.stringify(envelope))) } });
    await expect(readCanonicalIdentityAgeReview(c, binding())).rejects.toThrow("actual bill differ");
  });
  it.each([{ finishReason: "length" }, { usage: { prompt_tokens: 1000, completion_tokens: 1501 } }])("requires complete output within its paid1500-token question: %j", async over => {
    const d = deps(over); expect(await reviewCanonicalIdentityAge(c, input, d)).toMatchObject({ state: "blocked", wireFault: "truncated" });
    expect(await readCanonicalIdentityAgeReview(c, binding())).toMatchObject({ state: "blocked", wireFault: "truncated" });
    expect(d.judge).toHaveBeenCalledTimes(1);
  });
  it("rechecks ownership after reserving and sends nothing if the claim changed in that gap", async () => {
    const d = deps(); let checks = 0;
    d.fence = async () => { checks += 1; if (checks === 2) throw new Error("lost-before-provider"); };
    expect(await reviewCanonicalIdentityAge(c, input, d)).toMatchObject({ state: "held" });
    expect(d.judge).not.toHaveBeenCalled();
    expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(GAME), CANONICAL_IDENTITY_AGE_REVIEW_KEY)).toMatchObject({ state: "unknown" });
  });
  it("a lost post-purchase claim retains the bill and lets the next real worker replay it", async () => {
    let lost = false; const d = deps(); d.fence = async () => { if (lost) throw new Error("lost-claim"); };
    d.judge.mockImplementation(async () => { lost = true; return reply(); });
    await expect(reviewCanonicalIdentityAge(c, input, d)).rejects.toThrow("lost-claim");
    const next = deps(); expect(await reviewCanonicalIdentityAge(c, input, next)).toMatchObject({ state: "pass", replayed: true });
    expect(next.judge).not.toHaveBeenCalled(); expect(d.judge).toHaveBeenCalledTimes(1);
  });
  it("uses the same inclusive4-dollar budget and stops before a dispatch without time or a credential", async () => {
    const budget = boardWizardBudgetOf(c), world = boardWizardWorldId(GAME), d = deps();
    expect(await reviewCanonicalIdentityAge(c, input, { ...d, deadlineAt: Date.now() + 1 })).toMatchObject({ state: "pending" });
    await expect(reviewCanonicalIdentityAge(c, input, { fence: d.fence })).rejects.toThrow("credential required");
    expect(await budget.readRequest(world, CANONICAL_IDENTITY_AGE_REVIEW_KEY)).toBeNull();
    await budget.reserve(world, { requestKey: "already-bought", scope: "image", operationFingerprint: "existing", reserveMicroUsd: 3_980_000 });
    await budget.settle(world, "already-bought", bill("req-existing", 3_980_000));
    await expect(reviewCanonicalIdentityAge(c, input, d)).rejects.toThrow("inclusive authorized QA world ceiling");
    expect(d.judge).not.toHaveBeenCalled();
  });
  it("real shared wire sends two exact images at Luna LOW without a second provider implementation", async () => {
    const response = reply(), wire = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      model: response.model, usage: response.usage, choices: [{ finish_reason: "stop", message: { content: response.raw } }],
    }), { headers: { "x-request-id": "req-shared-wire" } }));
    vi.stubGlobal("fetch", wire);
    expect(await reviewCanonicalIdentityAge(c, input, { fence: deps().fence, apiKey: "synthetic-not-a-key" })).toMatchObject({ state: "pass" });
    const body = JSON.parse(String(wire.mock.calls[0]![1]!.body));
    expect(body).toMatchObject({ model: "gpt-5.6-luna", reasoning_effort: "low", max_completion_tokens: 1500, store: false });
    expect(body.messages[0].content.filter((item: { type: string }) => item.type === "image_url")).toHaveLength(2);
  });
});
