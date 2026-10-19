import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { BackgroundReviewRefused, type BackgroundReviewState, type BackgroundReviewTransport } from "../../../infra/generation/types";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { maskForHide } from "../../../domain/scene/local-patch-hides";
import { SUBJECT_POLICY_V2, SUBJECT_READER_V2, subjectPlanFor } from "../../../domain/generation/subject-policy";
import { SUBJECT_QUALITY_BUNDLE_VERSION } from "../../../domain/generation/subject-quality-bundle";
import { LEAN_WARM_HAT_VERSION, SUBJECT_PAINTER_V4 } from "../../../domain/generation/subject-painter";
import { leanReviewPolicy } from "../../../domain/generation/visual-review-policy";
import type { Container } from "../../container";
import { boardsOfWorlds } from "../../world-catalog.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import type { LocalPatchHideDeps } from "../local-patch-hide";
import type { DualReviewProof } from "../local-patch-dual-evidence";
import { allowedDualPublication } from "../local-patch-dual-publication";
import { LOCAL_PATCH_STYLE, recoverParkedLocalPatchReviews, runLocalPatchWorldSlice } from "../local-patch-world";
import { tickGeneration } from "../queue";
import { advanceContinuityInBackground, backgroundRoundIdOf } from "../continuity-background";
import { DUAL_VISUAL_REVIEW_V3, pinVisualReviewRelease } from "../visual-review-release";
import { sha256Bytes } from "../fixed-sprite";
import { SYSTEM_ENROLLMENT_OPERATOR, subjectUpgradeOf } from "../subject-enrollment";
import type { SelfRepairWire } from "../local-patch-self-repair";
import { localPatchHideEvidenceIds } from "../local-patch-judge";
import { LOCAL_PATCH_LEAN_ACTION, leanReleaseAuditId, leanReleaseReceipt } from "../lean-release";
import { interruptionShape, PROVIDER_FAILED_SHAPE } from "../local-patch-review-interruption-recovery";
import { bill, paintedOk, seedApprovedGame } from "./local-patch-fixtures";
import { GOOD_V12_VERDICT, boundHide, longAnswer, publicationBinding } from "./local-patch-dual-fixtures";

/**
 * local-patch-lean/v1 on a whole paid world (synthetic child, age 8; no real photograph, no provider): the world
 * enrolls itself before its first painting, paints every appearance at MEDIUM with its planned look, asks Sol both
 * questions together in the background on Flex, decides each picture in one slice, falls back to the default tier
 * once when the provider refuses Flex, repaints a child refused for who they are a third time with no diagnosis
 * (while a compositing refusal still gets one), publishes under its own Sol policies, and stays inside its ceiling (four dollars, aiming under three).
 */
const fakes = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0, LOCAL_PATCH_PLAYER_REVIEW: "on",
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", LOCAL_PATCH_PROMPT_RELEASE: "v15" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fakes.testers }), flag: () => false, adminEmails: () => [] }));

const journey = new Set(boardsOfWorlds(["journey"]));
const BOARDS = localPatchBoardsForVersion(12).filter(board => journey.has(board.board)), HIDES = BOARDS.flatMap(board => board.hides);
const boardOf = (hideId: string) => BOARDS.find(b => b.hides.some(h => h.id === hideId))!;
/** Refused twice for a different child's face: its third painting passes, with no diagnosis bought. */
const THIRD = BOARDS.find(b => b.board !== "antarctica")!.hides[0]!;
/** Refused twice for a located broken join: it goes to self-repair, whose plan geometry clears every sibling. */
const SEAM = BOARDS.find(b => b.board === "antarctica")!.hides[2]!;
/** The provider refuses its first Flex create (429): it is asked once more at the default tier. */
const REFUSED = BOARDS.find(b => b.board !== "antarctica" && b.board !== boardOf(THIRD.id).board)!.hides[1]!;
const IDENTITY_DEFECT = "Child by the stall: short straight hair and a narrow face, not the photograph's";
const HEADS = ["three-quarter", "profile", "down", "up", "away"] as const, EXPRESSIONS = ["closed-smile", "focused", "surprised", "neutral"] as const;
const observed = (status: string) => ({ status, observation: "A specific synthetic observation of the drawn child." });

let directory: string, db: PrismaClient, c: Container;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-lean-world-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-lean-world", analytics: { track: vi.fn() }, adminEmails: [],
    email: { id: "console", send: async () => ({ id: "synthetic-mail" }) }, emailFallbackTo: null } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live requests forbidden in the lean world"); }));
}, 180_000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-lean-world-")) rmSync(directory, { recursive: true });
});

/** A paid nine-board v12 journey (synthetic child, age 8) with an approved identity, a stored synthetic photograph, dual review v3 and the lean pin. */
async function leanWorld(gameId: string) {
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: LOCAL_PATCH_STYLE, status: "TARGETS_GENERATING",
    withJob: true, scenes: BOARDS.map(board => ({ slug: board.board, version: 12 })) });
  fakes.testers.push(seeded.email);
  await db.order.create({ data: { id: `ord-${gameId}`, gameId, userId: seeded.userId, provider: "mock", packageTier: "ONE_WORLD",
    amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  const avatar = await sharp(seeded.sheet).resize(256, 256).png().toBuffer(), avatarId = `ast-avatar-${gameId}`;
  await c.storage.put(`game/${avatarId}.png`, avatar, "image/png");
  await db.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", status: "READY",
    storagePath: `game/${avatarId}.png`, mimeType: "image/png", bytes: avatar.length, width: 256, height: 256, provider: "openai" } });
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { avatarAssetId: avatarId } });
  // The "photograph" is a synthetic raster: no real child anywhere in this test.
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
  await db.$transaction(tx => pinVisualReviewRelease(tx, gameId, DUAL_VISUAL_REVIEW_V3));
  // The pin a lean draft receives at creation (lean-release.test.ts creates it through the real draft path).
  await db.auditLog.create({ data: { id: leanReleaseAuditId(gameId), actorType: "SYSTEM", action: LOCAL_PATCH_LEAN_ACTION,
    entityType: "Game", entityId: gameId, metaJson: JSON.stringify(leanReleaseReceipt(gameId)) } });
  return seeded;
}

/** Synthetic painter; every paid attempt differs, and every prompt and requested quality is kept. */
function painter(gameId: string, prompts: Map<string, string>, qualities: Map<string, string | undefined>): LocalPatchHideDeps {
  return { renderPolicySha256: "f".repeat(64), judge: async () => { throw Error("Per-hide judge forbidden"); },
    render: async ({ requestKey, stylePng, prompt, subjectQuality }) => {
      const hide = HIDES.find(h => requestKey.startsWith(`${h.id}:`));
      if (!hide) throw Error(`Unexpected synthetic request ${requestKey}`);
      prompts.set(requestKey, prompt); qualities.set(requestKey, subjectQuality);
      const attempt = Number(requestKey.split(":").at(-1)) + (requestKey.includes(":self-repair:") ? 3 : 0), mask = maskForHide(hide);
      const figure = await sharp({ create: { width: Math.round(mask.width * 0.6), height: Math.round(mask.height * 0.8),
        channels: 4, background: { r: Math.min(255, 30 * attempt), g: 60, b: 160, alpha: 255 } } }).png().toBuffer();
      const png = await sharp(stylePng).composite([{ input: figure,
        left: mask.left + Math.round(mask.width * 0.2), top: mask.top + Math.round(mask.height * 0.2) }]).png().toBuffer();
      return paintedOk(png, bill(`paint-${gameId}-${requestKey}`));
    } };
}

/** Sol, answering in the background: the bundle (quality and subject together) or the continuity question.
 * `lose`: that appearance's first bundle create never answers (a lost create: an unknown charge).
 * `slow`: that appearance's first continuity answer keeps running until `released()` (19 October: one Flex answer ran 25 minutes).
 * `fail`: the provider ends that appearance's first bundle `failed`, with no text and no usage (19 October, Flex). */
function sol(options: { lose?: string; slow?: string; released?: () => boolean; fail?: string } = {}) {
  const creates: { hideId: string; kind: "bundle" | "continuity"; tier: unknown; attempts: number }[] = [];
  const polls = new Map<string, { hideId: string; kind: "bundle" | "continuity"; tier: unknown; n: number; reads: number }>();
  const bundles = new Map<string, number>(), refused = new Set<string>(), lost = new Set<string>();
  let slowResponse: string | null = null, slowReads = 0;
  const fake: BackgroundReviewTransport = { namespace: "openai:find-me-existing",
    create: async body => {
      const prompt = (body.input as { content: { text?: string }[] }[])[0]!.content[0]!.text!, bound = boundHide(prompt);
      const kind = prompt.includes(SUBJECT_QUALITY_BUNDLE_VERSION) ? "bundle" as const : "continuity" as const;
      creates.push({ hideId: bound.hideId, kind, tier: body.service_tier, attempts: bound.attempts });
      if (bound.hideId === options.lose && kind === "bundle" && !lost.has(bound.hideId)) { lost.add(bound.hideId); throw Error("socket hang up"); }
      // Flex capacity is unavailable once, for one appearance's quality question: documented, nothing created.
      if (bound.hideId === REFUSED.id && kind === "bundle" && body.service_tier === "flex" && !refused.has(bound.hideId)) {
        refused.add(bound.hideId); throw new BackgroundReviewRefused(429, null);
      }
      const n = kind === "bundle" ? (bundles.get(bound.hideId) ?? 0) + 1 : 0;
      if (kind === "bundle") bundles.set(bound.hideId, n);
      const responseId = `resp_lean${creates.length}`;
      polls.set(responseId, { hideId: bound.hideId, kind, tier: body.service_tier, n, reads: 0 });
      if (kind === "continuity" && bound.hideId === options.slow && slowResponse === null) slowResponse = responseId;
      return { responseId };
    },
    retrieve: async (responseId): Promise<BackgroundReviewState> => {
      const state = polls.get(responseId);
      if (!state) return { status: "missing" };
      if (responseId === slowResponse && !options.released?.()) { slowReads++; return { status: "in_progress" }; }
      if (++state.reads === 1) return { status: "in_progress" };
      if (state.hideId === options.fail && state.kind === "bundle" && state.n === 1)
        return { status: "failed", reading: { responseId, raw: null, usage: null, model: "gpt-6.1-sol", finishReason: "failed", serviceTier: String(state.tier) } };
      return { status: "completed", reading: { responseId, raw: state.kind === "bundle" ? bundleAnswer(state.hideId, state.n) : longAnswer(state.hideId, 400, 400, 160),
        usage: { input_tokens: 2000, output_tokens: 500 }, model: "gpt-6.1-sol", finishReason: "stop", serviceTier: String(state.tier) } };
    },
    cancel: async () => {} };
  return { fake, creates, bundles, slowReads: () => slowReads };
}

/** The n-th bundle answer about one appearance: every look its own; THIRD's first two show another child's face; SEAM's first two a broken join. */
function bundleAnswer(hideId: string, n: number) {
  const plan = subjectPlanFor(boardOf(hideId), hideId), index = HIDES.findIndex(h => h.id === hideId);
  const stranger = hideId === THIRD.id && n <= 2, broken = hideId === SEAM.id && n <= 2;
  const verdict = broken ? { ...GOOD_V12_VERDICT, pictureWhole: "fail", verdict: "fail", reason: "A located broken join",
    faults: [{ check: "pictureWhole", where: "At the left return edge a penguin's body stops in a straight vertical cut" }] } : GOOD_V12_VERDICT;
  return JSON.stringify({ version: SUBJECT_QUALITY_BUNDLE_VERSION,
    quality: { hides: [{ hideId, evidenceIds: localPatchHideEvidenceIds(hideId), verdict }] },
    subject: { hideId, subjectPolicy: SUBJECT_POLICY_V2, checks: { photoLikeness: observed(stranger ? "fail" : "pass"), canonicalAgreement: observed("pass"),
      faceVisible: observed("pass"), perceivedAge: { ...observed("pass"), estimatedMinYears: 7, estimatedMaxYears: 9 },
      requiredWardrobe: observed(plan.warmHat ? "pass" : "not-required") },
    appearance: { head: HEADS[index % HEADS.length], expression: EXPRESSIONS[index % EXPRESSIONS.length], engagement: index % 2 ? "acting" : "watching", portraitCopy: false },
    faults: stranger ? [{ check: "photoLikeness", where: IDENTITY_DEFECT }] : [] } });
}

describe("local-patch-lean/v1 on a whole paid world", () => {
  it("enrolls itself, paints MEDIUM with planned looks, asks Sol both questions together on Flex, repaints without a diagnosis and publishes inside its ceiling", async () => {
    const gameId = "lean-world"; await leanWorld(gameId);
    const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId), prompts = new Map<string, string>(), qualities = new Map<string, string | undefined>();
    const provider = sol();
    // No synchronous question and no Opus anywhere in a lean world.
    const request = vi.fn<NonNullable<Container["visualReview"]>["request"]>(async () => { throw Error("A lean world asks no synchronous review"); });
    const container = { ...c, visualReview: { request }, backgroundReview: provider.fake } as Container;
    const diagnoses: SelfRepairWire[] = [];
    const mask = maskForHide(SEAM), core = { left: mask.left + 12, top: 40, width: 40, height: 60 };
    const diagnose = vi.fn(async (wire: SelfRepairWire) => {
      diagnoses.push(wire);
      return { verdict: null, raw: JSON.stringify({ cause: "composition-clipping", action: "recompose-retained", sourceKey: `${SEAM.id}:${SEAM.pose}:render:1`,
        returnWindow: { left: 16, top: 16, width: 480, height: 736 }, protectedCore: core, faceRect: { left: core.left + 4, top: core.top + 4, width: 30, height: 30 },
        explanation: "Synthetic diagnosis of the broken join." }), usage: { prompt_tokens: 9000, completion_tokens: 500 },
        requestId: `req-${gameId}-diagnosis-${diagnoses.length}`, model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false };
    });

    // The first slice enrolls the world before anything is painted.
    expect(await subjectUpgradeOf(db, gameId)).toBeNull();
    let result = await runLocalPatchWorldSlice(container, painter(gameId, prompts, qualities), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose });
    expect(result.attention).toBeNull();
    expect(await subjectUpgradeOf(db, gameId)).toMatchObject({ actorType: "SYSTEM", operatorId: SYSTEM_ENROLLMENT_OPERATOR, ageYears: 8 });

    let ticks = 1;
    for (; ticks < 900 && result.pending; ticks++)
      result = await runLocalPatchWorldSlice(container, painter(gameId, prompts, qualities), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose });
    expect(result.attention).toBeNull();
    const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.status).not.toBe("TARGETS_GENERATING");
    expect(game.configJson).not.toBeNull();
    const rows = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } } });
    expect(rows).toHaveLength(27);
    expect(request).not.toHaveBeenCalled();

    // Every painting MEDIUM, told its own planned look; the Antarctica ones the pushed-back hat.
    expect(prompts.size).toBeGreaterThanOrEqual(27);
    for (const [key, prompt] of prompts) {
      expect(qualities.get(key)).toBe("medium");
      expect(prompt).toContain(SUBJECT_PAINTER_V4);
      expect(prompt).not.toContain("a readable three-quarter face is welcome");
      const hideId = HIDES.find(h => key.startsWith(`${h.id}:`))!.id, plan = subjectPlanFor(boardOf(hideId), hideId);
      expect(prompt).toContain(`head ${plan.head}; ${plan.gaze}; expression ${plan.expression}`);
      expect(prompt.includes(`WARM HAT (${LEAN_WARM_HAT_VERSION})`)).toBe(plan.warmHat);
      if (plan.warmHat) expect(prompt).toContain("worn pushed back off the forehead");
    }

    // Each picture's two questions went out together: the continuity question in the same create run as its bundle.
    const flex = provider.creates.filter(cr => cr.tier === "flex"), defaults = provider.creates.filter(cr => cr.tier === "default");
    expect(defaults).toEqual([{ hideId: REFUSED.id, kind: "bundle", tier: "default", attempts: 1 }]);
    for (const [index, create] of provider.creates.entries()) {
      if (create.kind !== "bundle" || create.tier !== "flex" || (create.hideId === REFUSED.id && create.attempts === 1)) continue;
      expect(provider.creates[index + 1]).toMatchObject({ hideId: create.hideId, kind: "continuity", tier: "flex" });
    }
    expect(flex.length).toBeGreaterThan(27 * 2 - 1);

    // A child refused twice for who they are: a third painting with the located reasons, no diagnosis.
    expect([...prompts.keys()].filter(key => key.startsWith(`${THIRD.id}:`)).sort()).toEqual(
      [1, 2, 3].map(n => `${THIRD.id}:${THIRD.pose}:render:${n}`));
    expect(prompts.get(`${THIRD.id}:${THIRD.pose}:render:3`)).toContain(`The reviewer located on the refused painting: "photoLikeness: ${IDENTITY_DEFECT}"`);
    expect(diagnoses.every(wire => !wire.prompt.includes(THIRD.id))).toBe(true);
    // A broken join twice: self-repair, with its one diagnosis.
    expect(diagnoses).toHaveLength(1);
    expect([...prompts.keys()].some(key => key === `${SEAM.id}:${SEAM.pose}:render:3`)).toBe(false);

    // Published under Sol's own policies, each answer priced by the tier that served it.
    for (const row of rows) {
      expect(row.status).toBe("GENERATED");
      const receipt = JSON.parse(row.judgeJson!), proof = receipt.boardReview.dual as DualReviewProof;
      const quality = receipt.hide === REFUSED.id ? leanReviewPolicy("scene-quality", "default") : leanReviewPolicy("scene-quality", "flex");
      expect(proof.quality.policy).toEqual(quality);
      expect(proof.continuity!.policy).toEqual(leanReviewPolicy("head-continuity", "flex"));
      expect(proof.subject).toMatchObject({ subjectPolicy: SUBJECT_POLICY_V2, reader: SUBJECT_READER_V2, combined: SUBJECT_QUALITY_BUNDLE_VERSION,
        requestKey: proof.quality.requestKey });
      expect(proof.quality.costMicroUsd).toBe(receipt.hide === REFUSED.id ? 10_000 : 5_000);
      expect(proof.continuity!.costMicroUsd).toBe(5_000);
      // Decided in one review: no "next question" checkpoint was ever written between its answers.
      expect(receipt.dualQualityCheckpoint).toBeUndefined();
      expect(receipt.dualContinuityCheckpoint).toBeUndefined();
      expect(await allowedDualPublication(db, publicationBinding(gameId, row))).toBe(true);
    }
    // The refused Flex create cost nothing and is the provider's documented zero.
    const ledger = await budget.audit(worldId);
    expect(ledger).toMatchObject({ held: false, pendingRequestKeys: [], unknownRequestKeys: [], capMicroUsd: 4_000_000 });
    expect(ledger.committedMicroUsd).toBeLessThanOrEqual(3_000_000);
    // Each lean question reserved its role's lean amount (one every interruption recovery admits): 0.20 for a bundle, 0.12 for continuity.
    const snapshot = JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).snapshotJson) as { requests: { requestKey: string; reserveMicroUsd: number; state: string; evidence?: { amountMicroUsd: number } }[] };
    const asked = snapshot.requests.filter(r => r.requestKey.startsWith("self-repair:board:") && !r.requestKey.includes(":diagnosis:"));
    expect(asked.length).toBeGreaterThan(54);
    for (const r of asked) expect([200_000, 120_000]).toContain(r.reserveMicroUsd);
    expect(new Set(asked.map(r => r.reserveMicroUsd))).toEqual(new Set([200_000, 120_000]));
    expect(snapshot.requests.filter(r => r.state === "settled" && r.evidence?.amountMicroUsd === 0)).toHaveLength(1);
    // Without its pin the same answers are not a lean world's: publication refuses Sol's lean policies.
    const row = rows.find(r => JSON.parse(r.judgeJson!).hide === THIRD.id)!;
    await db.auditLog.delete({ where: { id: leanReleaseAuditId(gameId) } });
    expect(await allowedDualPublication(db, publicationBinding(gameId, row))).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  }, 1_500_000);

  it("recovers a lost lean create like any other interrupted review, and still finishes the world (Codex P1, 19 October)", async () => {
    const gameId = "lean-world-lost"; await leanWorld(gameId);
    const provider = sol({ lose: THIRD.id }), container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: provider.fake } as Container;
    const diagnose = vi.fn(async (wire: SelfRepairWire) => {
      const mask = maskForHide(SEAM), core = { left: mask.left + 12, top: 40, width: 40, height: 60 };
      return { verdict: null, raw: JSON.stringify({ cause: "composition-clipping", action: "recompose-retained", sourceKey: `${SEAM.id}:${SEAM.pose}:render:1`,
        returnWindow: { left: 16, top: 16, width: 480, height: 736 }, protectedCore: core, faceRect: { left: core.left + 4, top: core.top + 4, width: 30, height: 30 },
        explanation: "Synthetic diagnosis of the broken join." }), usage: { prompt_tokens: 9000, completion_tokens: 500 },
        requestId: `req-${gameId}-diagnosis-${wire.prompt.length}`, model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false };
    });
    let result = { pending: true, attention: null as string | null };
    for (let ticks = 0; ticks < 900 && result.pending; ticks++)
      result = await runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose });
    expect(result.attention).toBeNull();
    expect((await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson).not.toBeNull();
    // The lost create's charge stays unknown and reserved in full, continued by the ordinary review recovery.
    const worldId = boardWizardWorldId(gameId), audit = await boardWizardBudgetOf(c).audit(worldId);
    expect(audit.unknownRequestKeys).toHaveLength(1);
    const [lostKey] = audit.unknownRequestKeys;
    expect(await boardWizardBudgetOf(c).readRequest(worldId, lostKey!)).toMatchObject({ state: "unknown", reserveMicroUsd: 200_000 });
    expect((await boardWizardBudgetOf(c).readContinuationApproval(worldId, lostKey!))?.version).toMatch(/^world-automatic-review-recovery\/v[12]$/);
  }, 1_500_000);

  it("keeps no appearance waiting on a sibling's slow answer: the rest of its board is asked and decided meanwhile (19 October)", async () => {
    const gameId = "lean-world-slow"; await leanWorld(gameId);
    const busy = new Set([boardOf(THIRD.id).board, boardOf(REFUSED.id).board, boardOf(SEAM.id).board]);
    const board = BOARDS.find(b => !busy.has(b.board))!, [SLOW, ...siblings] = board.hides as [typeof board.hides[number], ...typeof board.hides];
    let released = false;
    const provider = sol({ slow: SLOW.id, released: () => released });
    const container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: provider.fake } as Container;
    const diagnose = vi.fn(async (wire: SelfRepairWire) => {
      const mask = maskForHide(SEAM), core = { left: mask.left + 12, top: 40, width: 40, height: 60 };
      return { verdict: null, raw: JSON.stringify({ cause: "composition-clipping", action: "recompose-retained", sourceKey: `${SEAM.id}:${SEAM.pose}:render:1`,
        returnWindow: { left: 16, top: 16, width: 480, height: 736 }, protectedCore: core, faceRect: { left: core.left + 4, top: core.top + 4, width: 30, height: 30 },
        explanation: "Synthetic diagnosis of the broken join." }), usage: { prompt_tokens: 9000, completion_tokens: 500 },
        requestId: `req-${gameId}-diagnosis-${wire.prompt.length}`, model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false };
    });
    const slice = () => runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose });
    const decided = async (hideId: string) => {
      const hide = board.hides.find(h => h.id === hideId)!;
      const row = await db.targetVariantAsset.findFirst({ where: { variant: "A", targetInstance: { targetId: hide.targetId, gameScene: { gameId, sceneSlug: board.board } } } });
      return row?.status === "GENERATED" && JSON.parse(row.judgeJson ?? "null")?.reviewState === "board-review-complete";
    };
    let ticks = 0;
    while (ticks++ < 200 && !(await Promise.all(siblings.map(h => decided(h.id)))).every(Boolean)) await slice();
    // The slow appearance was asked first, and its continuity answer still runs; both siblings were asked after it and are already decided.
    const firstCreate = (hideId: string) => provider.creates.findIndex(cr => cr.hideId === hideId);
    expect(firstCreate(SLOW.id)).toBeGreaterThanOrEqual(0);
    for (const sibling of siblings) expect(firstCreate(sibling.id)).toBeGreaterThan(firstCreate(SLOW.id));
    expect(await Promise.all(siblings.map(h => decided(h.id)))).toEqual(siblings.map(() => true));
    expect(await decided(SLOW.id)).toBe(false);
    expect(provider.slowReads()).toBeGreaterThan(0);
    expect(provider.creates.filter(cr => cr.hideId === SLOW.id && cr.kind === "continuity")).toHaveLength(1);
    // Once it answers, it is read and decided like any other answer: never asked twice.
    released = true;
    while (ticks++ < 400 && !await decided(SLOW.id)) await slice();
    expect(await decided(SLOW.id)).toBe(true);
    expect(provider.creates.filter(cr => cr.hideId === SLOW.id && cr.kind === "continuity")).toHaveLength(1);
  }, 1_500_000);

  it("continues by itself when the provider ends a Flex answer failed: its charge stays unknown in full, the same pixels are asked again (19 October)", async () => {
    const gameId = "lean-world-failed"; await leanWorld(gameId);
    const busy = new Set([boardOf(THIRD.id).board, boardOf(REFUSED.id).board, boardOf(SEAM.id).board]);
    const FAILED = BOARDS.find(b => !busy.has(b.board))!.hides[1]!;
    const provider = sol({ fail: FAILED.id }), container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: provider.fake } as Container;
    const diagnose = vi.fn(async (wire: SelfRepairWire) => {
      const mask = maskForHide(SEAM), core = { left: mask.left + 12, top: 40, width: 40, height: 60 };
      return { verdict: null, raw: JSON.stringify({ cause: "composition-clipping", action: "recompose-retained", sourceKey: `${SEAM.id}:${SEAM.pose}:render:1`,
        returnWindow: { left: 16, top: 16, width: 480, height: 736 }, protectedCore: core, faceRect: { left: core.left + 4, top: core.top + 4, width: 30, height: 30 },
        explanation: "Synthetic diagnosis of the broken join." }), usage: { prompt_tokens: 9000, completion_tokens: 500 },
        requestId: `req-${gameId}-diagnosis-${wire.prompt.length}`, model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false };
    });
    // Only the scheduled ticks, as production runs them: no person acts. The held ledger parks the world for at most the
    // tick that found it; the next one continues the failed answer and the world goes on.
    const ready = async () => (await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson !== null;
    let result = { pending: true, attention: null as string | null }, parked = 0;
    for (let ticks = 0; ticks < 900 && !await ready(); ticks++) {
      result = await runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose });
      if (result.attention) parked++;
    }
    expect(await ready()).toBe(true);
    expect(result.attention).toBeNull();
    expect(parked).toBeLessThanOrEqual(1);
    // The failed answer's charge is unknown and counted in full, continued by the ordinary automatic recovery.
    const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c), audit = await budget.audit(worldId);
    expect(audit.unknownRequestKeys).toHaveLength(1);
    const [failedKey] = audit.unknownRequestKeys;
    expect(await budget.readRequest(worldId, failedKey!)).toMatchObject({ state: "unknown", reserveMicroUsd: 200_000 });
    expect((await budget.readContinuationApproval(worldId, failedKey!))?.version).toMatch(/^world-automatic-review-recovery\/v[12]$/);
    expect(audit.committedMicroUsd).toBeLessThanOrEqual(audit.capMicroUsd);
    // Asked again about the same pixels, and published; the record names the provider's failure.
    expect(provider.creates.filter(cr => cr.hideId === FAILED.id && cr.kind === "bundle").length).toBeGreaterThanOrEqual(2);
    const board = boardOf(FAILED.id);
    const row = (await db.targetVariantAsset.findFirst({ where: { variant: "A", targetInstance: { targetId: FAILED.targetId, gameScene: { gameId, sceneSlug: board.board } } } }))!;
    expect(row.status).toBe("GENERATED");
    const receipt = JSON.parse(row.judgeJson!);
    expect(receipt.reviewInterruption).toMatchObject({ providerFailed: PROVIDER_FAILED_SHAPE, wireFault: "http", responseId: expect.stringMatching(/^resp_lean/) });
    expect(receipt.evidenceAttempts).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "transport", code: "http" })]));
  }, 1_500_000);

  it("lets the scheduled tick continue a world parked by a provider-declared failure, and never an operator's hold (Codex P1, 19 October)", async () => {
    const gameId = "lean-world-parked", held = "lean-world-held";
    await leanWorld(gameId); await leanWorld(held);
    const busy = new Set([boardOf(THIRD.id).board, boardOf(REFUSED.id).board, boardOf(SEAM.id).board]);
    const FAILED = BOARDS.find(b => !busy.has(b.board))!.hides[1]!;
    const provider = sol({ fail: FAILED.id }), container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: provider.fake } as Container;
    const diagnose = vi.fn(async (wire: SelfRepairWire) => {
      const mask = maskForHide(SEAM), core = { left: mask.left + 12, top: 40, width: 40, height: 60 };
      return { verdict: null, raw: JSON.stringify({ cause: "composition-clipping", action: "recompose-retained", sourceKey: `${SEAM.id}:${SEAM.pose}:render:1`,
        returnWindow: { left: 16, top: 16, width: 480, height: 736 }, protectedCore: core, faceRect: { left: core.left + 4, top: core.top + 4, width: 30, height: 30 },
        explanation: "Synthetic diagnosis of the broken join." }), usage: { prompt_tokens: 9000, completion_tokens: 500 },
        requestId: `req-${gameId}-diagnosis-${wire.prompt.length}`, model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false };
    });
    const slice = () => runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose });
    // Up to the failing bundle's create, and no further: nothing has read its end yet.
    for (let ticks = 0; ticks < 300 && !provider.creates.some(cr => cr.hideId === FAILED.id && cr.kind === "bundle"); ticks++) await slice();
    const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c);
    const unknownKey = async () => (await budget.audit(worldId)).unknownRequestKeys.find(key => key.startsWith("self-repair:board:"));
    for (let reads = 0; reads < 5 && !await unknownKey(); reads++) await advanceContinuityInBackground(container, gameId);
    const key = (await unknownKey())!;
    expect(key).toBeDefined();
    // Both parked as a held review parks a world; the second by an operator, for another reason, with nothing to continue.
    for (const [id, why] of [[gameId, "Continuity question in the background: the world ledger is held; nothing was sent"], [held, "An operator holds this world"]] as const)
      await db.generationJob.update({ where: { id: `job_${id}` }, data: { status: "FAILED", currentStep: "local-patch:needs-release", lastError: why } });
    const job = () => db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
    const heldBefore = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${held}` } });
    // An operator's hold on this very world, with the same admitted failure in its ledger: never released or continued.
    const engineHold = (await job()).lastError!;
    await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { lastError: "An operator holds this world for another reason" } });
    await tickGeneration(container, null, 60_000);
    expect(await job()).toMatchObject({ status: "FAILED", currentStep: "local-patch:needs-release", lastError: "An operator holds this world for another reason" });
    expect(await budget.readContinuationApproval(worldId, key)).toBeNull();
    await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { lastError: engineHold } });
    const parkedAt = (await job()).updatedAt.getTime();
    // Thirty older parked worlds ahead of it (not enrolled, between their tries) never crowd it out of the scan.
    for (let n = 0; n < 30; n++) {
      await db.game.create({ data: { id: `lean-world-crowd-${n}`, status: "TARGETS_GENERATING", styleVersion: LOCAL_PATCH_STYLE } });
      await db.generationJob.create({ data: { id: `job_lean-world-crowd-${n}`, gameId: `lean-world-crowd-${n}`, status: "FAILED",
        currentStep: "local-patch:needs-release", lastError: "local-patch: the world ledger is held; reconcile its unresolved charge before continuing",
        updatedAt: new Date(parkedAt - 61_000 - n) } });
    }
    // A retained failure alone is not enough: with its round's recorded end altered, the scheduled tick continues nothing.
    const outcomeId = `aud_sb_${backgroundRoundIdOf(worldId, key)}_outcome`, outcome = await db.auditLog.findUniqueOrThrow({ where: { id: outcomeId } });
    await db.auditLog.update({ where: { id: outcomeId }, data: { metaJson: JSON.stringify({ ...JSON.parse(outcome.metaJson!), providerStatus: "completed" }) } });
    await tickGeneration(container, null, 60_000);
    expect(await job()).toMatchObject({ status: "FAILED", currentStep: "local-patch:needs-release" });
    expect(await budget.readContinuationApproval(worldId, key)).toBeNull();
    await db.auditLog.update({ where: { id: outcomeId }, data: { metaJson: outcome.metaJson } });
    // Between its tries the scheduler leaves it alone; without room for one preparation it starts none.
    expect(await recoverParkedLocalPatchReviews(container, {}, parkedAt + 5 * 60_000)).toBeNull();
    expect(await recoverParkedLocalPatchReviews(container, {}, Date.now(), Date.now() + 10_000)).toBe(gameId);
    expect(await budget.readContinuationApproval(worldId, key)).toBeNull();
    expect(await job()).toMatchObject({ status: "FAILED", currentStep: "local-patch:needs-release" });
    // Its tries never expire: thirty hours on it is still a candidate in its minute (no room here, so nothing is started).
    expect(await recoverParkedLocalPatchReviews(container, {}, parkedAt + 30 * 60 * 60_000, Date.now() + 10_000)).toBe(gameId);
    expect(await budget.readContinuationApproval(worldId, key)).toBeNull();
    // The scheduled tick (no game named) continues it: the unknown charge kept whole, the job queued again.
    await tickGeneration(container, null, 60_000);
    expect((await budget.readContinuationApproval(worldId, key))?.version).toMatch(/^world-automatic-review-recovery\/v[12]$/);
    expect(await budget.readRequest(worldId, key)).toMatchObject({ state: "unknown", reserveMicroUsd: 200_000 });
    expect(await job()).toMatchObject({ status: "QUEUED", currentStep: "local-patch" });
    // The operator's hold is untouched.
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${held}` } })).toEqual(heldBefore);
    // And the world finishes with its ordinary slices.
    const ready = async () => (await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson !== null;
    for (let ticks = 0; ticks < 900 && !await ready(); ticks++) await slice();
    expect(await ready()).toBe(true);
  }, 1_500_000);

  it("admits only no answer at all, or a background response its provider ended failed with no text and no usage", () => {
    const BG = "Background review charge could not be verified", SYNC = "Grouped review charge could not be verified";
    const failed = { transport: "openai-responses-background/v1", providerStatus: "failed", wireFault: "http", costUnknown: true, finishReason: "failed",
      raw: null, usage: null, requestId: "resp_synthetic", responseId: "resp_synthetic", model: "gpt-6.1-sol" };
    const timeout = { wireFault: "timeout", costUnknown: true, raw: null, usage: null, requestId: null, model: null, finishReason: null };
    expect(interruptionShape(SYNC, timeout)).toBe("timeout");
    expect(interruptionShape(BG, failed)).toBe("provider-failed");
    for (const change of [{ usage: { input_tokens: 10, output_tokens: 0 } }, { raw: "{}" }, { providerStatus: "incomplete" }, { providerStatus: "cancelled" },
      { finishReason: "stop" }, { wireFault: "timeout" }, { costUnknown: false }, { requestId: "resp_other" }, { requestId: null }, { transport: "batch" }])
      expect(interruptionShape(BG, { ...failed, ...change })).toBeNull();
    expect(interruptionShape(SYNC, failed)).toBeNull();
    expect(interruptionShape(BG, timeout)).toBeNull();
    expect(interruptionShape(null, failed)).toBeNull();
    expect(interruptionShape(BG, null)).toBeNull();
  });

  it("enrolls only a lean world with its child's live photograph, and only before anything is painted", async () => {
    const provider = sol(), container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: provider.fake } as Container;
    const slice = (gameId: string) => runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000 });
    // Not lean: nothing is enrolled automatically.
    const plain = "lean-world-plain"; await leanWorld(plain);
    await db.auditLog.delete({ where: { id: leanReleaseAuditId(plain) } });
    await slice(plain);
    expect(await subjectUpgradeOf(db, plain)).toBeNull();
    // The photograph is gone: the world parks with the reason, having painted and bought nothing.
    const photoless = "lean-world-photoless"; await leanWorld(photoless);
    await db.asset.update({ where: { id: `ast-photo-${photoless}` }, data: { deletedAt: new Date(), status: "DELETED" } });
    const before = await boardWizardBudgetOf(c).audit(boardWizardWorldId(photoless));
    const parked = await slice(photoless);
    expect(parked.attention).toContain("local-patch-lean: the world cannot enroll in its subject policy: the privately owned original photograph is not available");
    expect(await subjectUpgradeOf(db, photoless)).toBeNull();
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${photoless}` } })).toMatchObject({ status: "FAILED", currentStep: "local-patch:recovery-exhausted" });
    expect(await db.targetVariantAsset.count({ where: { targetInstance: { gameScene: { gameId: photoless } }, attempts: { gt: 0 } } })).toBe(0);
    expect(await boardWizardBudgetOf(c).audit(boardWizardWorldId(photoless))).toMatchObject({ committedMicroUsd: before.committedMicroUsd, pendingRequestKeys: [] });
    // A painting already started outside the policy: never enrolled after the fact.
    const started = "lean-world-started"; await leanWorld(started);
    await db.auditLog.delete({ where: { id: leanReleaseAuditId(started) } });
    await slice(started);
    expect(await db.targetVariantAsset.count({ where: { targetInstance: { gameScene: { gameId: started } }, attempts: { gt: 0 } } })).toBeGreaterThan(0);
    await db.auditLog.create({ data: { id: leanReleaseAuditId(started), actorType: "SYSTEM", action: LOCAL_PATCH_LEAN_ACTION,
      entityType: "Game", entityId: started, metaJson: JSON.stringify(leanReleaseReceipt(started)) } });
    await db.generationJob.update({ where: { id: `job_${started}` }, data: { status: "QUEUED", currentStep: "local-patch" } });
    expect((await slice(started)).attention).toContain("a painting was started before the enrollment");
    expect(await subjectUpgradeOf(db, started)).toBeNull();
  }, 600_000);

  it("reads a SYSTEM enrollment only as the lean release's own, and no person's receipt as it", async () => {
    const gameId = "lean-world-system"; await leanWorld(gameId);
    const container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: sol().fake } as Container;
    await runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000 });
    const enrolled = await db.auditLog.findUniqueOrThrow({ where: { id: `aud_subject_upgrade_${gameId}` } });
    const receipt = JSON.parse(enrolled.metaJson!);
    expect(receipt).toMatchObject({ actorType: "SYSTEM", operatorId: SYSTEM_ENROLLMENT_OPERATOR });
    // A SYSTEM receipt naming anyone else, and a person's receipt naming the release, are both refused.
    for (const [actorType, operatorId] of [["SYSTEM", "operator-synthetic"], ["ADMIN", SYSTEM_ENROLLMENT_OPERATOR]] as const) {
      await db.auditLog.update({ where: { id: enrolled.id }, data: { actorType, actorId: operatorId, metaJson: JSON.stringify({ ...receipt, actorType, operatorId }) } });
      await expect(subjectUpgradeOf(db, gameId)).rejects.toThrow("Subject upgrade enrollment is invalid");
    }
  }, 600_000);

  it("waits minutes, not an hour, for a lean world's answers to return capacity under its ceiling", async () => {
    const gameId = "lean-world-backoff"; await leanWorld(gameId);
    const container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: sol().fake } as Container;
    const wait = async (minutes: number) => db.generationJob.update({ where: { id: `job_${gameId}` },
      data: { status: "QUEUED", currentStep: "local-patch:recovery-budget-wait", updatedAt: new Date(Date.now() - minutes * 60_000) } });
    const slice = () => runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000 });
    await wait(1);
    expect(await slice()).toMatchObject({ claimed: false, pending: true });
    await wait(4);
    expect((await slice()).claimed).toBe(true);
    // The same world without its lean pin keeps the hour.
    await db.auditLog.delete({ where: { id: leanReleaseAuditId(gameId) } });
    await wait(4);
    expect(await slice()).toMatchObject({ claimed: false, pending: true });
  }, 600_000);
});
