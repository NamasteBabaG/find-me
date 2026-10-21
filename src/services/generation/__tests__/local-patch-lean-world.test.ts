import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
import { LEAN_RECOVERY_BACKOFF_MS, LOCAL_PATCH_STYLE, runLocalPatchWorldSlice } from "../local-patch-world";
import { tickGeneration } from "../queue";
import { SOL_BACKGROUND_ACTION, advanceContinuityInBackground, backgroundReviewWaiting, backgroundRoundIdOf, backgroundRoundOfKey } from "../continuity-background";
import { LeanReviewRecoveryRefused, SPENT_CONTINUATIONS_HOLD, applyLeanReviewRecovery, planLeanReviewRecovery } from "../lean-review-recovery";
import { LEAN_REVIEW_RECOVERY_ACTION, leanNewWorldRecoveryReceipt, leanReviewRecoveryAuditId } from "../../../domain/generation/lean-review-recovery";
import { continueAdmittedReviewInterruptions, openAdmittedInterruptions, resumptionAfterContinuation } from "../subject-upgrade";
import { LOCAL_PATCH_PARKED_WAKE_ACTION, PARKED_WAKE_SPACING_MS, claimParkedWake, nextParkedWake } from "../local-patch-parked-wake";
import { DUAL_VISUAL_REVIEW_V3, pinVisualReviewRelease } from "../visual-review-release";
import { sha256Bytes } from "../fixed-sprite";
import { SYSTEM_ENROLLMENT_OPERATOR, subjectUpgradeOf } from "../subject-enrollment";
import type { SelfRepairWire } from "../local-patch-self-repair";
import { localPatchHideEvidenceIds } from "../local-patch-judge";
import { LOCAL_PATCH_LEAN_ACTION, leanReleaseAuditId, leanReleaseReceipt } from "../lean-release";
import { interruptionShape, PROVIDER_FAILED_SHAPE } from "../local-patch-review-interruption-recovery";
import { WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT } from "../../../domain/generation/world-budget";
import { bill, paintedOk, seedApprovedGame } from "./local-patch-fixtures";
import { GOOD_V12_VERDICT, boundHide, longAnswer, publicationBinding } from "./local-patch-dual-fixtures";

/**
 * local-patch-lean/v1 on a whole paid world (synthetic child, age 8; no real photograph, no provider): the world
 * enrolls itself before its first painting, paints every appearance at MEDIUM with its planned look, asks Sol both
 * questions together in the background on Flex, decides each picture in one slice, falls back to the default tier
 * once when the provider refuses Flex, repaints a child refused for who they are a third time with no diagnosis
 * (while a compositing refusal still gets one), publishes under its own Sol policies, and stays inside its ceiling (four dollars, aiming under three).
 */
const fakes = vi.hoisted(() => ({ testers: [] as string[], apiKey: undefined as string | undefined }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0, LOCAL_PATCH_PLAYER_REVIEW: "on",
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", OPENAI_API_KEY: fakes.apiKey, LOCAL_PATCH_PROMPT_RELEASE: "v15" }),
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

afterEach(() => { fakes.apiKey = undefined; });

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
 * `fail`: the provider ends that appearance's first bundle `failed`, with no text and no usage (19 October, Flex).
 * `failContinuity`: the same for that appearance's first continuity question, asked beside its bundle; it ends a read later.
 * `failMany`: `fail` for each of these appearances.
 * `failFast`: that appearance's first bundle has already ended `failed` when it is first read.
 * `failCode`: the error code a failed response of that appearance names (background-provider-error/v1).
 * `failureUsage`: the usage a failed response reports (a bill), instead of none. */
function sol(options: { lose?: string; slow?: string; released?: () => boolean; fail?: string; failContinuity?: string; failMany?: ReadonlySet<string>; failContinuityMany?: ReadonlySet<string>;
  failFast?: string; failCode?: ReadonlyMap<string, string>; failureUsage?: Readonly<Record<string, number>> } = {}) {
  const creates: { hideId: string; kind: "bundle" | "continuity"; tier: unknown; attempts: number }[] = [];
  /** The digest of every body sent: a question sent twice is the same body twice. */
  const bodies: string[] = [];
  const polls = new Map<string, { hideId: string; kind: "bundle" | "continuity"; tier: unknown; n: number; reads: number }>();
  const bundles = new Map<string, number>(), continuities = new Map<string, number>(), refused = new Set<string>(), lost = new Set<string>();
  let slowResponse: string | null = null, slowReads = 0, failingContinuity: string | null = null;
  const fake: BackgroundReviewTransport = { namespace: "openai:find-me-existing",
    create: async body => {
      const prompt = (body.input as { content: { text?: string }[] }[])[0]!.content[0]!.text!, bound = boundHide(prompt);
      const kind = prompt.includes(SUBJECT_QUALITY_BUNDLE_VERSION) ? "bundle" as const : "continuity" as const;
      creates.push({ hideId: bound.hideId, kind, tier: body.service_tier, attempts: bound.attempts });
      bodies.push(sha256Bytes(Buffer.from(JSON.stringify(body))));
      if (bound.hideId === options.lose && kind === "bundle" && !lost.has(bound.hideId)) { lost.add(bound.hideId); throw Error("socket hang up"); }
      // Flex capacity is unavailable once, for one appearance's quality question: documented, nothing created.
      if (bound.hideId === REFUSED.id && kind === "bundle" && body.service_tier === "flex" && !refused.has(bound.hideId)) {
        refused.add(bound.hideId); throw new BackgroundReviewRefused(429, null);
      }
      const counts = kind === "bundle" ? bundles : continuities;
      const n = (counts.get(bound.hideId) ?? 0) + 1;
      counts.set(bound.hideId, n);
      const responseId = `resp_lean${creates.length}`;
      polls.set(responseId, { hideId: bound.hideId, kind, tier: body.service_tier, n, reads: 0 });
      if (kind === "continuity" && bound.hideId === options.slow && slowResponse === null) slowResponse = responseId;
      if (kind === "continuity" && bound.hideId === options.failContinuity && failingContinuity === null) failingContinuity = responseId;
      return { responseId };
    },
    retrieve: async (responseId): Promise<BackgroundReviewState> => {
      const state = polls.get(responseId);
      if (!state) return { status: "missing" };
      if (responseId === slowResponse && !options.released?.()) { slowReads++; return { status: "in_progress" }; }
      const failFast = state.hideId === options.failFast && state.kind === "bundle" && state.n === 1;
      if (++state.reads === 1 && !failFast) return { status: "in_progress" };
      // The failing continuity question ends a read after its bundle: the two failures arrive at different times.
      if (responseId === failingContinuity && state.reads === 2) return { status: "in_progress" };
      if ((state.hideId === options.fail || options.failMany?.has(state.hideId)) && state.kind === "bundle" && state.n === 1 || responseId === failingContinuity || state.kind === "continuity" && state.n === 1 && options.failContinuityMany?.has(state.hideId) || failFast)
        return { status: "failed", reading: { responseId, raw: null, usage: options.failureUsage ? { ...options.failureUsage } : null, model: "gpt-6.1-sol",
          finishReason: "failed", serviceTier: String(state.tier),
          ...(options.failCode?.has(state.hideId) ? { providerError: { code: options.failCode.get(state.hideId)!, message: "Synthetic provider message" } } : {}) } };
      return { status: "completed", reading: { responseId, raw: state.kind === "bundle" ? bundleAnswer(state.hideId, state.n) : longAnswer(state.hideId, 400, 400, 160),
        usage: { input_tokens: 2000, output_tokens: 500 }, model: "gpt-6.1-sol", finishReason: "stop", serviceTier: String(state.tier) } };
    },
    cancel: async () => {} };
  return { fake, creates, bodies, bundles, slowReads: () => slowReads };
}

/** The pin a new lean draft receives with its lean release (pinLeanRelease; lean-release.test.ts creates it through the real draft path). */
async function pinRecovery(gameId: string) {
  await db.auditLog.create({ data: { id: leanReviewRecoveryAuditId(gameId), actorType: "SYSTEM", action: LEAN_REVIEW_RECOVERY_ACTION,
    entityType: "Game", entityId: gameId, metaJson: JSON.stringify(leanNewWorldRecoveryReceipt(gameId)) } });
}
/** The synthetic diagnosis every world of this file buys for SEAM's broken join. */
const seamDiagnosis = (gameId: string) => vi.fn(async (wire: SelfRepairWire) => {
  const mask = maskForHide(SEAM), core = { left: mask.left + 12, top: 40, width: 40, height: 60 };
  return { verdict: null, raw: JSON.stringify({ cause: "composition-clipping", action: "recompose-retained", sourceKey: `${SEAM.id}:${SEAM.pose}:render:1`,
    returnWindow: { left: 16, top: 16, width: 480, height: 736 }, protectedCore: core, faceRect: { left: core.left + 4, top: core.top + 4, width: 30, height: 30 },
    explanation: "Synthetic diagnosis of the broken join." }), usage: { prompt_tokens: 9000, completion_tokens: 500 },
    requestId: `req-${gameId}-diagnosis-${wire.prompt.length}`, model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false };
});
/** The appearance a request key asked about, from its own round record. */
const hideOfKey = async (gameId: string, requestKey: string) => (await backgroundRoundOfKey(db, gameId, boardWizardWorldId(gameId), requestKey))!.intent.binding.hideId;

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
    // Only ordinary slices: no person acts, and the world is never parked. Held only by an admitted interruption, a slice
    // yields queued (a candidate of the scheduled selection) and the next one continues the failed answer first.
    const ready = async () => (await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson !== null;
    let result = { pending: true, attention: null as string | null }, parked = 0;
    for (let ticks = 0; ticks < 900 && !await ready(); ticks++) {
      result = await runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose });
      if (result.attention || (await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } })).currentStep === "local-patch:needs-release") parked++;
    }
    expect(await ready()).toBe(true);
    expect(result.attention).toBeNull();
    expect(parked).toBe(0);
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

  it("wakes a world the engine parked on an admitted failure from the scheduled tick, three turns per hold, never an operator's hold (local-patch-parked-wake/v1)", async () => {
    const gameId = "lean-world-parked";
    await leanWorld(gameId);
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
    // Parked as the deployed engine parked the QA world: its hold names the interrupted question.
    const engineHold = `${key}: the result is kept but its charge cannot be stated (Background review charge could not be verified)`;
    const park = (lastError: string) => db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "FAILED", currentStep: "local-patch:needs-release", lastError } });
    const job = () => db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
    const approval = () => budget.readContinuationApproval(worldId, key);
    // A scheduled turn: the queue's choice and claim (`nextParkedWake`, `claimParkedWake`, exactly what tickGeneration
    // takes before it runs a world's slice), then that world's own slice. Ten minutes pass for every turn already taken.
    const scheduled = async () => {
      const wake = await nextParkedWake(container);
      if (!wake || wake.gameId !== gameId || !await claimParkedWake(container, wake)) return null;
      await slice();
      return wake;
    };
    const turns = () => db.auditLog.findMany({ where: { action: LOCAL_PATCH_PARKED_WAKE_ACTION, entityId: gameId } });
    const later = async () => { for (const turn of await turns()) await db.auditLog.update({ where: { id: turn.id },
      data: { createdAt: new Date(turn.createdAt.getTime() - PARKED_WAKE_SPACING_MS - 1_000) } }); };
    // An operator's hold on this very world, with the same admitted failure in its ledger, names no interrupted question:
    // the scheduled tick never chooses it, and a tick naming it neither continues nor releases.
    await park("An operator holds this world for another reason");
    expect(await nextParkedWake(container)).toBeNull();
    // Other worlds of this file may still be pending: the scheduled tick may choose one of them, never this one.
    expect((await tickGeneration(container, null, 60_000)).gameId).not.toBe(gameId);
    await slice();
    expect(await job()).toMatchObject({ status: "FAILED", currentStep: "local-patch:needs-release", lastError: "An operator holds this world for another reason" });
    expect(await approval()).toBeNull();
    expect(await turns()).toHaveLength(0);
    // Parked as the deployed engine parked the QA world, its hold naming the interrupted question. A turn whose slice never
    // runs (here claimed and nothing more, as on a deployment that cannot dispatch it) is counted all the same: at most
    // three per hold, ten minutes apart, then the scheduled tick leaves it.
    await park(engineHold);
    for (const attempt of [1, 2, 3]) {
      const turn = (await nextParkedWake(container))!;
      expect(turn).toMatchObject({ gameId, attempt });
      expect(await claimParkedWake(container, turn)).toBe(true);
      expect(await nextParkedWake(container)).toBeNull();
      await later();
    }
    expect(await nextParkedWake(container)).toBeNull();
    expect(await job()).toMatchObject({ status: "FAILED", currentStep: "local-patch:needs-release", lastError: engineHold });
    // Parked again (a new hold), with its round's recorded end altered: one turn, and its slice refuses for a reason
    // waiting cannot change. The hold now says exactly why; nothing is continued or released, and it is never woken again.
    await park(engineHold);
    const outcomeId = `aud_sb_${backgroundRoundIdOf(worldId, key)}_outcome`, outcome = await db.auditLog.findUniqueOrThrow({ where: { id: outcomeId } });
    await db.auditLog.update({ where: { id: outcomeId }, data: { metaJson: JSON.stringify({ ...JSON.parse(outcome.metaJson!), providerStatus: "completed" }) } });
    expect(await scheduled()).toMatchObject({ gameId, attempt: 1 });
    expect(await job()).toMatchObject({ status: "FAILED", currentStep: "local-patch:needs-release",
      lastError: `local-patch-continue-in-slice/v1: ${key} is an unknown charge the automatic continuation does not admit (Background review charge could not be verified); a person reconciles or authorizes it` });
    expect(await approval()).toBeNull();
    await later();
    expect(await nextParkedWake(container)).toBeNull();
    await db.auditLog.update({ where: { id: outcomeId }, data: { metaJson: outcome.metaJson } });
    // A pass that wrote the approval and then lost its claim (its fence refuses the image's write): the approval stands,
    // its image never recorded it, and it stays open for the next pass, never skipped (Codex round 17).
    const recorded = async () => !!await db.auditLog.findUnique({ where: { id: (await approval())!.approvalId } });
    await expect(continueAdmittedReviewInterruptions(container, gameId, {}, Date.now() + 270_000, async () => { throw Error("claim lost"); }))
      .rejects.toThrow("claim lost");
    const written = (await approval())!;
    expect(written.version).toMatch(/^world-automatic-review-recovery\/v[12]$/);
    expect(await recorded()).toBe(false);
    const open = await openAdmittedInterruptions(container, gameId);
    expect(open !== "blocked" && [...open.values()].flatMap(item => item.requestKeys)).toEqual([key]);
    // The job is untouched by that pass: still parked, with the reason the refused turn wrote.
    expect(await job()).toMatchObject({ status: "FAILED", currentStep: "local-patch:needs-release", lastError: expect.stringMatching(/^local-patch-continue-in-slice\/v1: /) });
    // Its own record intact and parked again by the engine (a new hold, its own turns): the scheduled tick takes one turn,
    // once, and the world's slice finishes that continuation (the same approval, recorded on its image; the unknown
    // charge kept whole) and re-queues it.
    await park(engineHold);
    const wake = (await nextParkedWake(container))!;
    expect(wake).toMatchObject({ gameId, attempt: 1 });
    expect(await claimParkedWake(container, wake)).toBe(true);
    expect(await claimParkedWake(container, wake)).toBe(false);
    // The turn's slice and the owner's tick at the same moment: whichever records the image first, the other never writes
    // a reason over the hold (its refusal is transient), and the world is released once.
    await Promise.all([slice(), slice()]);
    expect((await job()).lastError ?? "").not.toMatch(/^local-patch-continue-in-slice\/v1: /);
    expect(await approval()).toEqual(written);
    expect(await budget.countContinuationApprovals(worldId)).toEqual({ [written.version]: 1 });
    expect(await recorded()).toBe(true);
    expect(await budget.readRequest(worldId, key)).toMatchObject({ state: "unknown", reserveMicroUsd: 200_000 });
    expect((await job()).currentStep).not.toBe("local-patch:needs-release");
    // A pass that recorded it and stopped before releasing: the engine's hold, nothing open. The scheduled tick chooses it
    // (here without a painter, so tickGeneration stops after its claim and the world's slice follows), and that slice
    // finishes the same resumption from the recorded continuation.
    await park(engineHold);
    expect(await tickGeneration(container, null, 60_000)).toMatchObject({ gameId });
    expect(fetch).not.toHaveBeenCalled(); // This legacy scheduled turn has no painter configured.
    await slice();
    expect((await job()).currentStep).not.toBe("local-patch:needs-release");
    expect(await approval()).toEqual(written);
    // And the world finishes with its ordinary slices, never parked again.
    const ready = async () => (await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson !== null;
    for (let ticks = 0; ticks < 900 && !await ready(); ticks++) {
      await slice();
      expect((await job()).currentStep).not.toBe("local-patch:needs-release");
    }
    expect(await ready()).toBe(true);
  }, 1_500_000);

  it("continues both questions of one image that the provider ended failed side by side, together (Codex round 16)", async () => {
    const gameId = "lean-world-failed-twice"; await leanWorld(gameId);
    const busy = new Set([boardOf(THIRD.id).board, boardOf(REFUSED.id).board, boardOf(SEAM.id).board]);
    const TWICE = BOARDS.find(b => !busy.has(b.board))!.hides[2]!;
    const provider = sol({ fail: TWICE.id, failContinuity: TWICE.id }), container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: provider.fake } as Container;
    const diagnose = vi.fn(async (wire: SelfRepairWire) => {
      const mask = maskForHide(SEAM), core = { left: mask.left + 12, top: 40, width: 40, height: 60 };
      return { verdict: null, raw: JSON.stringify({ cause: "composition-clipping", action: "recompose-retained", sourceKey: `${SEAM.id}:${SEAM.pose}:render:1`,
        returnWindow: { left: 16, top: 16, width: 480, height: 736 }, protectedCore: core, faceRect: { left: core.left + 4, top: core.top + 4, width: 30, height: 30 },
        explanation: "Synthetic diagnosis of the broken join." }), usage: { prompt_tokens: 9000, completion_tokens: 500 },
        requestId: `req-${gameId}-diagnosis-${wire.prompt.length}`, model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false };
    });
    const ready = async () => (await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson !== null;
    for (let ticks = 0; ticks < 900 && !await ready(); ticks++) {
      await runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose });
      expect((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } })).currentStep).not.toBe("local-patch:needs-release");
    }
    expect(await ready()).toBe(true);
    // Both unknown, both continued, recorded on the image in one step: one failed round (not an outage of two), both questions kept.
    const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c), audit = await budget.audit(worldId);
    expect(audit.unknownRequestKeys).toHaveLength(2);
    for (const key of audit.unknownRequestKeys) expect((await budget.readContinuationApproval(worldId, key))?.version).toMatch(/^world-automatic-review-recovery\/v[12]$/);
    const board = boardOf(TWICE.id);
    const row = (await db.targetVariantAsset.findFirst({ where: { variant: "A", targetInstance: { targetId: TWICE.targetId, gameScene: { gameId, sceneSlug: board.board } } } }))!;
    expect(row.status).toBe("GENERATED");
    const receipt = JSON.parse(row.judgeJson!);
    expect(receipt.reviewInterruptions).toHaveLength(2);
    expect(new Set(receipt.reviewInterruptions.map((one: { requestKey: string }) => one.requestKey))).toEqual(new Set(audit.unknownRequestKeys));
    expect(receipt.evidenceAttempts.filter((a: { code: string; attempt: number }) => a.code === "http" && a.attempt === 1)).toHaveLength(1);
  }, 1_500_000);

  it("never parks when the review of a board the slice just completed reads its bundle already ended failed (Codex round 17)", async () => {
    const gameId = "lean-world-failed-at-once"; await leanWorld(gameId);
    const busy = new Set([boardOf(THIRD.id).board, boardOf(REFUSED.id).board, boardOf(SEAM.id).board]);
    const FAST = BOARDS.find(b => !busy.has(b.board))!.hides[0]!;
    const provider = sol({ failFast: FAST.id }), container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: provider.fake } as Container;
    const diagnose = vi.fn(async (wire: SelfRepairWire) => {
      const mask = maskForHide(SEAM), core = { left: mask.left + 12, top: 40, width: 40, height: 60 };
      return { verdict: null, raw: JSON.stringify({ cause: "composition-clipping", action: "recompose-retained", sourceKey: `${SEAM.id}:${SEAM.pose}:render:1`,
        returnWindow: { left: 16, top: 16, width: 480, height: 736 }, protectedCore: core, faceRect: { left: core.left + 4, top: core.top + 4, width: 30, height: 30 },
        explanation: "Synthetic diagnosis of the broken join." }), usage: { prompt_tokens: 9000, completion_tokens: 500 },
        requestId: `req-${gameId}-diagnosis-${wire.prompt.length}`, model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false };
    });
    const ready = async () => (await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson !== null;
    for (let ticks = 0; ticks < 900 && !await ready(); ticks++) {
      await runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose });
      expect((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } })).currentStep).not.toBe("local-patch:needs-release");
    }
    expect(await ready()).toBe(true);
    const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c), audit = await budget.audit(worldId);
    expect(audit.unknownRequestKeys).toHaveLength(1);
    expect((await budget.readContinuationApproval(worldId, audit.unknownRequestKeys[0]!))?.version).toMatch(/^world-automatic-review-recovery\/v[12]$/);
  }, 1_500_000);

  it("parks for a person, within a slice, at the failure its continuations cannot cover: it never yields without progress", async () => {
    const gameId = "lean-world-failed-often"; await leanWorld(gameId);
    // Two continuations under v1 and four more under v2 (an enrolled world): the seventh failure is a person's to decide.
    const covered = 2 + WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT, special = new Set([THIRD.id, REFUSED.id, SEAM.id]);
    const FAILING = HIDES.filter(h => !special.has(h.id)).slice(0, covered + 1);
    const provider = sol({ failMany: new Set(FAILING.map(h => h.id)) }), container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: provider.fake } as Container;
    const diagnose = vi.fn(async (wire: SelfRepairWire) => {
      const mask = maskForHide(SEAM), core = { left: mask.left + 12, top: 40, width: 40, height: 60 };
      return { verdict: null, raw: JSON.stringify({ cause: "composition-clipping", action: "recompose-retained", sourceKey: `${SEAM.id}:${SEAM.pose}:render:1`,
        returnWindow: { left: 16, top: 16, width: 480, height: 736 }, protectedCore: core, faceRect: { left: core.left + 4, top: core.top + 4, width: 30, height: 30 },
        explanation: "Synthetic diagnosis of the broken join." }), usage: { prompt_tokens: 9000, completion_tokens: 500 },
        requestId: `req-${gameId}-diagnosis-${wire.prompt.length}`, model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false };
    });
    const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c);
    const job = () => db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
    // Once the uncovered failure holds the ledger, a slice parks the world: its continuation could not complete, so it
    // never yields to try again (a loop with no progress).
    let uncovered = 0;
    for (let ticks = 0; ticks < 900 && (await job()).currentStep !== "local-patch:needs-release"; ticks++) {
      // Seven unknown answers stay reserved in full ($1.40 of the $4), so the world waits for capacity more often:
      // its three minutes pass here.
      if ((await job()).currentStep === "local-patch:recovery-budget-wait") await db.generationJob.update({ where: { id: `job_${gameId}` },
        data: { updatedAt: new Date(Date.now() - LEAN_RECOVERY_BACKOFF_MS - 1_000) } });
      await runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose });
      if ((await budget.audit(worldId)).unknownRequestKeys.length > covered) uncovered++;
      expect(uncovered).toBeLessThanOrEqual(2);
    }
    expect(await job()).toMatchObject({ status: "FAILED", currentStep: "local-patch:needs-release" });
    const audit = await budget.audit(worldId);
    expect(audit.unknownRequestKeys).toHaveLength(covered + 1);
    const approvals = await Promise.all(audit.unknownRequestKeys.map(key => budget.readContinuationApproval(worldId, key)));
    expect(approvals.filter(Boolean)).toHaveLength(covered);
    expect((await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson).toBeNull();
    // The park says exactly why, names the answer still reserved, and is not a hold the scheduled tick wakes.
    const uncoveredKey = audit.unknownRequestKeys[approvals.findIndex(one => !one)]!;
    expect((await job()).lastError).toBe(`local-patch-continue-in-slice/v1: the world's automatic review continuations are spent (2/2 under v1, `
      + `${WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT}/${WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT} under v2); ${uncoveredKey} stays reserved in full until a person reconciles or authorizes it`);
    expect(await nextParkedWake(c)).toBeNull();
    // Codex round 21: a resumption that finds the ledger held again after its continuation (here by an answer the
    // continuation admits but has not continued, exactly what a concurrent tick's sweep can add meanwhile) waits for
    // another turn and explains nothing; only a permanent blocker read fresh is explained.
    expect(await resumptionAfterContinuation(c, gameId)).toEqual({ action: "retry" });
    const uncoveredOutcome = `aud_sb_${backgroundRoundIdOf(worldId, uncoveredKey)}_outcome`;
    const recordedOutcome = await db.auditLog.findUniqueOrThrow({ where: { id: uncoveredOutcome } });
    await db.auditLog.update({ where: { id: uncoveredOutcome }, data: { metaJson: JSON.stringify({ ...JSON.parse(recordedOutcome.metaJson!), providerStatus: "completed" }) } });
    expect(await resumptionAfterContinuation(c, gameId)).toEqual({ action: "explain",
      reason: `${uncoveredKey} is an unknown charge the automatic continuation does not admit (Background review charge could not be verified); a person reconciles or authorizes it` });
    await db.auditLog.update({ where: { id: uncoveredOutcome }, data: { metaJson: recordedOutcome.metaJson } });
  }, 1_500_000);

  it("continues past 2+4 under v3 in a pinned world: each failed picture asked again at the default tier, its received answer replayed, every unknown kept (local-patch-lean-review-recovery/v1)", async () => {
    const gameId = "lean-world-recovery-v3"; await leanWorld(gameId); await pinRecovery(gameId);
    // The same seven provider-declared failures that park an unpinned world (the test above): the second QA world's, synthetically.
    const covered = 2 + WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT, special = new Set([THIRD.id, REFUSED.id, SEAM.id]);
    const FAILING = HIDES.filter(h => !special.has(h.id)).slice(0, covered + 1);
    const provider = sol({ failMany: new Set(FAILING.map(h => h.id)) }), container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: provider.fake } as Container;
    const diagnose = seamDiagnosis(gameId);
    const slice = () => runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose });
    const job = () => db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
    const ready = async () => (await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson !== null;
    for (let ticks = 0; ticks < 900 && !await ready(); ticks++) {
      if ((await job()).currentStep === "local-patch:recovery-budget-wait") await db.generationJob.update({ where: { id: `job_${gameId}` },
        data: { updatedAt: new Date(Date.now() - LEAN_RECOVERY_BACKOFF_MS - 1_000) } });
      // A few times, two workers at once (the scheduled tick and the owner's): neither sends what the other sent.
      if ([3, 11, 19].includes(ticks)) await Promise.all([slice(), slice()]); else await slice();
      expect((await job()).currentStep).not.toBe("local-patch:needs-release");
    }
    expect(await ready()).toBe(true);
    const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c), audit = await budget.audit(worldId);
    // Seven unknown answers, every reservation counted in full: the seventh continued under v3; nothing deleted or settled at zero.
    expect(audit.unknownRequestKeys).toHaveLength(covered + 1);
    expect(audit.reservedMicroUsd).toBe((covered + 1) * 200_000);
    expect(await budget.countContinuationApprovals(worldId)).toEqual({ "world-automatic-review-recovery/v1": 2,
      "world-automatic-review-recovery/v2": WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT, "world-automatic-review-recovery/v3": 1 });
    expect(audit.committedMicroUsd).toBeLessThanOrEqual(4_000_000);
    for (const hide of FAILING) {
      // Its bundle asked twice, on Flex and then at the default tier (a separate key and policy); its continuity answer received once, replayed.
      expect(provider.creates.filter(cr => cr.hideId === hide.id && cr.kind === "bundle").map(cr => cr.tier)).toEqual(["flex", "default"]);
      expect(provider.creates.filter(cr => cr.hideId === hide.id && cr.kind === "continuity").map(cr => cr.tier)).toEqual(["flex"]);
      const row = (await db.targetVariantAsset.findFirst({ where: { variant: "A", targetInstance: { targetId: hide.targetId, gameScene: { gameId, sceneSlug: boardOf(hide.id).board } } } }))!;
      expect(row.status).toBe("GENERATED");
      const proof = JSON.parse(row.judgeJson!).boardReview.dual as DualReviewProof;
      expect(proof.quality).toMatchObject({ policy: leanReviewPolicy("scene-quality", "default"), attempt: 2 });
      expect(proof.continuity).toMatchObject({ policy: leanReviewPolicy("head-continuity", "flex"), attempt: 1 });
      expect(await allowedDualPublication(db, publicationBinding(gameId, row))).toBe(true);
    }
    // No question was ever sent twice, whichever worker asked it.
    expect(new Set(provider.bodies).size).toBe(provider.bodies.length);
    expect(fetch).not.toHaveBeenCalled();
  }, 1_500_000);

  it("parks at once, saying exactly why, when the provider names a failure that is never asked again: no loop and no second question (local-patch-lean-review-recovery/v1)", async () => {
    const gameId = "lean-world-flagged"; await leanWorld(gameId); await pinRecovery(gameId);
    const busy = new Set([boardOf(THIRD.id).board, boardOf(REFUSED.id).board, boardOf(SEAM.id).board]);
    const FLAGGED = BOARDS.find(b => !busy.has(b.board))!.hides[1]!;
    const provider = sol({ fail: FLAGGED.id, failCode: new Map([[FLAGGED.id, "image_content_policy_violation"]]) });
    const container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: provider.fake } as Container;
    const slice = () => runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose: seamDiagnosis(gameId) });
    const job = () => db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
    for (let ticks = 0; ticks < 300 && (await job()).currentStep !== "local-patch:needs-release"; ticks++) await slice();
    const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c), audit = await budget.audit(worldId);
    expect(audit.unknownRequestKeys).toHaveLength(1);
    const key = audit.unknownRequestKeys[0]!;
    expect(await hideOfKey(gameId, key)).toBe(FLAGGED.id);
    expect(await job()).toMatchObject({ status: "FAILED", currentStep: "local-patch:needs-release",
      lastError: `local-patch-continue-in-slice/v1: ${key}: the provider ended it failed (content-policy: image_content_policy_violation);`
        + " a content-policy failure is never asked again automatically; a person reconciles or authorizes it" });
    // Its charge stays unknown and reserved in full; nothing continued it.
    expect(await budget.readRequest(worldId, key)).toMatchObject({ state: "unknown", reserveMicroUsd: 200_000 });
    expect(await budget.readContinuationApproval(worldId, key)).toBeNull();
    // Never woken, never continued, never asked again: more slices change nothing, and no plan releases it.
    expect(await nextParkedWake(c)).toBeNull();
    const parked = await job(), sent = provider.creates.length;
    for (let i = 0; i < 3; i++) await slice();
    expect(await job()).toEqual(parked);
    expect(provider.creates.length).toBe(sent);
    expect(provider.creates.filter(cr => cr.hideId === FLAGGED.id && cr.kind === "bundle")).toHaveLength(1);
    expect((await planLeanReviewRecovery(container, { gameId })).eligible).toBe(false);
    // Deleted, it is never resumed by anyone.
    await db.game.update({ where: { id: gameId }, data: { deletedAt: new Date() } });
    expect((await planLeanReviewRecovery(container, { gameId })).refusals.join("; ")).toContain("never resumed");
    expect(await slice()).toMatchObject({ claimed: false, pending: false });
  }, 1_500_000);

  it.each([["bundle", "image_content_policy_violation", "content-policy", true], ["continuity", "insufficient_quota", "account", true],
    ["bundle", "invalid_image", "request-invalid", true], ["continuity", "image_content_policy_violation", "content-policy", false]] as const)(
    "never asks again about pixels whose %s the provider failed with %s, priced or not: one dispatch, nothing after it (Codex QA R1)",
    async (role, code, kind, priced) => {
      const gameId = `lean-world-permanent-${role}-${kind}-${priced ? "priced" : "unpriced"}`; await leanWorld(gameId); await pinRecovery(gameId);
      const busy = new Set([boardOf(THIRD.id).board, boardOf(REFUSED.id).board, boardOf(SEAM.id).board]);
      const FAILING = BOARDS.find(b => !busy.has(b.board))!.hides[0]!;
      const provider = sol({ ...(role === "bundle" ? { fail: FAILING.id } : { failContinuity: FAILING.id }), failCode: new Map([[FAILING.id, code]]),
        ...(priced ? { failureUsage: { input_tokens: 2000, output_tokens: 500 } } : {}) });
      const container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: provider.fake } as Container;
      const slice = () => runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose: seamDiagnosis(gameId) });
      const job = () => db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
      for (let ticks = 0; ticks < 300 && (await job()).currentStep !== "local-patch:needs-release"; ticks++) await slice();
      // Parked for a person, saying which failure and why; the scheduled tick never wakes it.
      const parked = await job();
      expect(parked).toMatchObject({ status: "FAILED", currentStep: "local-patch:needs-release" });
      expect(parked.lastError).toContain(`(${kind}: ${code}); a ${kind} failure is never asked again automatically`);
      expect(await nextParkedWake(c)).toBeNull();
      // One question of that role about those pixels, on Flex; nothing about them at the default tier, nothing after it.
      const about = () => provider.creates.filter(cr => cr.hideId === FAILING.id);
      expect(about().filter(cr => cr.kind === role)).toEqual([expect.objectContaining({ tier: "flex" })]);
      expect(about().filter(cr => cr.tier !== "flex")).toEqual([]);
      expect(about().length).toBeLessThanOrEqual(2);
      // The failed answer's charge exactly as it arrived: a bill settled (never made unknown), no bill unknown and reserved in full.
      const outcome = (await db.auditLog.findMany({ where: { entityId: gameId, action: SOL_BACKGROUND_ACTION, id: { endsWith: "_outcome" } } }))
        .map(row => ({ id: row.id, event: JSON.parse(row.metaJson!) })).find(one => one.event.errorCode === code)!;
      expect(outcome.event).toMatchObject({ state: priced ? "unusable" : "unpriced", providerStatus: "failed" });
      const roundId = /^aud_sb_(sb[0-9a-f]{30})_outcome$/.exec(outcome.id)![1]!;
      const intent = JSON.parse((await db.auditLog.findUniqueOrThrow({ where: { id: `aud_sb_${roundId}_intent` } })).metaJson!).intent;
      expect(intent.binding.hideId).toBe(FAILING.id);
      const reserveMicroUsd = role === "bundle" ? 200_000 : 120_000;
      expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(gameId), intent.requestKey)).toMatchObject(priced ? { state: "settled", reserveMicroUsd }
        : { state: "unknown", reserveMicroUsd });
      // More slices change nothing: no dispatch, no release, the same hold.
      const sent = provider.creates.length;
      for (let i = 0; i < 3; i++) await slice();
      expect(provider.creates.length).toBe(sent);
      expect(await job()).toEqual(parked);
      expect(fetch).not.toHaveBeenCalled();
    }, 1_500_000);

  it("releases an existing world its 2+4 parked only through a person's plan bound to that exact hold, then finishes it under v3 (local-patch-lean-review-recovery/v1)", async () => {
    const gameId = "lean-world-quota-parked"; await leanWorld(gameId);
    const covered = 2 + WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT, special = new Set([THIRD.id, REFUSED.id, SEAM.id]);
    const FAILING = HIDES.filter(h => !special.has(h.id)).slice(0, covered + 1);
    const provider = sol({ failMany: new Set(FAILING.map(h => h.id)) }), container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: provider.fake } as Container;
    const diagnose = seamDiagnosis(gameId);
    const slice = () => runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose });
    const job = () => db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
    const age = async () => { if ((await job()).currentStep === "local-patch:recovery-budget-wait") await db.generationJob.update({ where: { id: `job_${gameId}` },
      data: { updatedAt: new Date(Date.now() - LEAN_RECOVERY_BACKOFF_MS - 1_000) } }); };
    const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c);
    // Parked as the deployed engine parked the second QA world: the seventh failure, v1 and v2 spent, money still free.
    for (let ticks = 0; ticks < 900 && (await job()).currentStep !== "local-patch:needs-release"; ticks++) { await age(); await slice(); }
    const parked = await job(), held = SPENT_CONTINUATIONS_HOLD.exec(parked.lastError ?? "")?.[1];
    expect(held).toMatch(/^self-repair:board:[a-z]+:[0-9a-f]{64}$/);
    expect((await budget.audit(worldId)).remainingMicroUsd).toBeGreaterThan(0);
    // Nothing wakes or continues it by itself.
    expect(await nextParkedWake(container)).toBeNull();
    await slice();
    expect(await job()).toEqual(parked);
    // A person reads the plan: what it binds, and why it may continue.
    const plan = await planLeanReviewRecovery(container, { gameId });
    expect(plan).toMatchObject({ eligible: true, refusals: [], binding: { worldId, jobId: `job_${gameId}`, heldRequestKeys: [held] },
      held: [{ requestKey: held, reserveMicroUsd: 200_000, shape: "provider-failed", refusal: null }],
      ledger: { unknownRequests: covered + 1, continuations: { "world-automatic-review-recovery/v1": 2, "world-automatic-review-recovery/v2": WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT } } });
    // Another digest, or an operator that is not a bounded identifier: refused, and nothing written.
    await expect(applyLeanReviewRecovery(container, { gameId, operatorId: "operator-synthetic", expectedPlanSha256: "0".repeat(64) })).rejects.toBeInstanceOf(LeanReviewRecoveryRefused);
    await expect(applyLeanReviewRecovery(container, { gameId, operatorId: "https://example.test/operator", expectedPlanSha256: plan.planSha256 }))
      .rejects.toBeInstanceOf(LeanReviewRecoveryRefused);
    expect(await db.auditLog.findUnique({ where: { id: leanReviewRecoveryAuditId(gameId) } })).toBeNull();
    // Applied: one pin and nothing else; the job's hold, the ledger and every approval exactly as they were. Again: nothing.
    const ledger = async () => (await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).snapshotJson, ledgerBefore = await ledger();
    expect(await applyLeanReviewRecovery(container, { gameId, operatorId: "operator-synthetic", expectedPlanSha256: plan.planSha256 }))
      .toMatchObject({ applied: true, receipt: { mode: "existing-world", operatorId: "operator-synthetic", binding: plan.binding } });
    expect(await applyLeanReviewRecovery(container, { gameId, operatorId: "operator-synthetic", expectedPlanSha256: plan.planSha256 })).toMatchObject({ applied: false });
    expect(await job()).toEqual(parked);
    expect(await ledger()).toBe(ledgerBefore);
    expect(await db.auditLog.findUniqueOrThrow({ where: { id: leanReviewRecoveryAuditId(gameId) } })).toMatchObject({ actorType: "ADMIN", actorId: "operator-synthetic" });
    expect((await planLeanReviewRecovery(container, { gameId })).refusals).toContain("the world already carries local-patch-lean-review-recovery/v1");
    // A pass that writes the v3 approval and then loses its claim before the image records it (its fence refuses): the
    // approval stands, unrecorded, and the hold is untouched; the next pass finishes that same approval, never a second.
    for (let reads = 0; reads < 10 && (await backgroundReviewWaiting(db, gameId, { inFlightOnly: true })).size; reads++)
      await advanceContinuityInBackground(container, gameId);
    await expect(continueAdmittedReviewInterruptions(container, gameId, {}, Date.now() + 270_000, async () => { throw Error("claim lost"); }))
      .rejects.toThrow("claim lost");
    const written = (await budget.readContinuationApproval(worldId, held!))!;
    expect(written).toMatchObject({ version: "world-automatic-review-recovery/v3", policyId: "local-patch-review-interruption/v3" });
    expect(await db.auditLog.findUnique({ where: { id: written.approvalId } })).toBeNull();
    expect(await job()).toEqual(parked);
    // The scheduled tick now gives exactly that hold its turn; the world's own slice finishes the continuation and re-queues it.
    const wake = (await nextParkedWake(container))!;
    expect(wake).toMatchObject({ gameId, attempt: 1 });
    expect(await claimParkedWake(container, wake)).toBe(true);
    for (let turn = 0; turn < 20 && (await job()).currentStep === "local-patch:needs-release"; turn++) await slice();
    expect((await job()).currentStep).not.toBe("local-patch:needs-release");
    expect(await budget.readContinuationApproval(worldId, held!)).toEqual(written);
    expect(await db.auditLog.findUnique({ where: { id: written.approvalId } })).not.toBeNull();
    expect(await budget.countContinuationApprovals(worldId)).toEqual({ "world-automatic-review-recovery/v1": 2,
      "world-automatic-review-recovery/v2": WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT, "world-automatic-review-recovery/v3": 1 });
    expect(await budget.readRequest(worldId, held!)).toMatchObject({ state: "unknown", reserveMicroUsd: 200_000 });
    // It finishes with its ordinary slices, the seventh picture asked again at the default tier, every unknown still counted.
    const ready = async () => (await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson !== null;
    for (let ticks = 0; ticks < 900 && !await ready(); ticks++) {
      await age(); await slice();
      expect((await job()).currentStep).not.toBe("local-patch:needs-release");
    }
    expect(await ready()).toBe(true);
    const seventh = await hideOfKey(gameId, held!);
    expect(provider.creates.filter(cr => cr.hideId === seventh && cr.kind === "bundle").map(cr => cr.tier)).toEqual(["flex", "default"]);
    const audit = await budget.audit(worldId);
    expect(audit.unknownRequestKeys).toHaveLength(covered + 1);
    expect(audit.committedMicroUsd).toBeLessThanOrEqual(4_000_000);
    expect(new Set(provider.bodies).size).toBe(provider.bodies.length);
    // A delivered world is never released again.
    expect((await planLeanReviewRecovery(container, { gameId })).eligible).toBe(false);
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


it.each([{ scenario: "all27 after a settled unreadable reference review", loseReference: false, capFailure: false, mixed: false, rejudge: true, capacity: false },
  { scenario: "safe cap refusal after added unknown outcomes", loseReference: true, capFailure: true, mixed: false, rejudge: false, capacity: false },
  { scenario: "all27 after a lost reference with the real five-continuity/two-bundle reserve mix", loseReference: true, capFailure: false, mixed: true, rejudge: false, capacity: false },
  { scenario: "capacity overload recovery all27", loseReference: true, capFailure: false, mixed: true, rejudge: false, capacity: true }])("repairs a rejected paid reference: $scenario (real 2+4 history, synthetic providers)", async ({ loseReference, capFailure, mixed, rejudge, capacity }) => {
  const wallNow = Date.now; let elapsedBackoff = 0;
  const capacityClock = capacity ? vi.spyOn(Date, "now").mockImplementation(() => wallNow() + elapsedBackoff) : null;
  try {
  fakes.apiKey = "synthetic-never-live";
  const { planIdentitySourceRevision, beginIdentitySourceRevision, advanceIdentitySourceRevision } = await import("../identity-source-revision");
  const { identityRevisionPending } = await import("../identity-source-revision-state");
  const { subjectStageCurrent } = await import("../local-patch-world");
  const { composeLocalPatchGame } = await import("../local-patch-player");
  const { identityApprovedForDisplay } = await import("../board-wizard-identity-gate");
  const styleModule = await import("../board-wizard-identity-style");
  const gameId = `lean-source-revision-${capacity ? "capacity" : mixed ? "recover" : loseReference ? "cap" : "clean"}-synthetic`, seeded = await leanWorld(gameId);
  const covered = 2 + WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT, special = new Set([THIRD.id, REFUSED.id, SEAM.id]);
  const failing = HIDES.filter(h => !special.has(h.id)).slice(0, covered + 1);
  const provider = sol({ failMany: new Set((mixed ? failing.slice(5) : failing).map(h => h.id)), ...(mixed ? { failContinuityMany: new Set(failing.slice(0, 5).map(h => h.id)) } : {}) });
  const operatorId = `source-revision-operator-${gameId}`, email = `${gameId}@example.invalid`;
  await db.user.create({ data: { id: operatorId, email } });
  const container = { ...c, adminEmails: [email], visualReview: { request: vi.fn() }, backgroundReview: provider.fake } as Container;
  const slice = () => runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose: seamDiagnosis(gameId) });
  const job = () => db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
  const elapseEvidenceBackoff = async () => {
    if (capacity && (await job()).currentStep === "local-patch:evidence-retry-wait") {
      const { LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS } = await import("../local-patch-review-recovery");
      // Simulate elapsed operational time, without editing the image's immutable evidence history.
      elapsedBackoff += LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS + 1000;
    }
  };
  for (let turns = 0; turns < 900 && (await job()).currentStep !== "local-patch:needs-release"; turns++) {
    if ((await job()).currentStep === "local-patch:recovery-budget-wait") await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { updatedAt: new Date(Date.now() - LEAN_RECOVERY_BACKOFF_MS - 1000) } });
    await elapseEvidenceBackoff(); await slice();
  }
  expect((await job()).lastError).toMatch(SPENT_CONTINUATIONS_HOLD);
  for (let n = 0; n < 10 && (await backgroundReviewWaiting(db, gameId, { inFlightOnly: true })).size; n++) await advanceContinuityInBackground(container, gameId);
  const originalEnrollment = await db.auditLog.findUniqueOrThrow({ where: { id: `aud_subject_upgrade_${gameId}` } });
  const originalIdentity = `ast-sheet-${gameId}`, oldReview = await db.auditLog.findFirstOrThrow({ where: { action: "board-wizard:identity-style-reviewed", entityId: originalIdentity } });
  const provenance = JSON.parse(oldReview.metaJson!).provenance;
  await db.auditLog.create({ data: { id: `source-original-paint-${gameId}`, actorType: "SYSTEM", action: "sheet:painted", entityType: "Asset", entityId: originalIdentity,
    metaJson: JSON.stringify({ gameId, identityProvenance: provenance }) } });
  const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(container), before = await budget.audit(worldId), parked = await job();
  const priorRequests = await Promise.all(before.unknownRequestKeys.map(key => budget.readRequest(worldId, key)));
  const previousRows = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, select: { id: true, attempts: true, assetId: true, judgeJson: true } });
  const marker = await sharp({ create: { width: 12, height: 12, channels: 4, background: "#1122bb" } }).png().toBuffer();
  const newSheet = await sharp(seeded.sheet).composite([{ input: marker, left: 5, top: 5 }]).png().toBuffer();
  let sourceImageCalls = 0, sourceReviewCalls = 0;
  const responseFormats: string[] = [];
  const createCharacter = vi.fn(async (request: { qaStyleContract?: { version: string } }) => {
    sourceImageCalls++; if (loseReference && sourceImageCalls === 1) throw Error("synthetic lost replacement image");
    expect(request.qaStyleContract?.version).toBe("board-matched-identity/v6");
    return { sheetPng: newSheet, sheetWidth: 1024, sheetHeight: 1024, avatarPng: newSheet, avatarWidth: 1024, avatarHeight: 1024,
      model: "gpt-image-2", usage: { input_tokens: 1000, output_tokens: 1000 }, costCents: 5, providerRequestId: `req_source_revision_${gameId}_${sourceImageCalls}`, durationMs: 1, attempts: 1 };
  });
  container.avatars = { id: "openai", createCharacter } as unknown as Container["avatars"];
  const styleSpy = vi.spyOn(styleModule, "buildBoardWizardIdentityStyle").mockResolvedValue({ version: "board-matched-identity/v6", png: seeded.sheet,
    catalogSha256: provenance.style.catalogSha256, atlasSha256: provenance.style.atlasSha256, examples: [] });
  const plan = await planIdentitySourceRevision(container, gameId);
  expect(plan).toMatchObject({ capMicroUsd: 4_000_000, all27MustRequalify: true, releaseCurrentIdentity: false });
  await expect(beginIdentitySourceRevision(container, { gameId, operatorId, expectedPlanSha256: "0".repeat(64) })).rejects.toThrow("changed");
  await expect(beginIdentitySourceRevision(container, { gameId, operatorId: seeded.userId, expectedPlanSha256: plan.planSha256 })).rejects.toThrow("administrator");
  await beginIdentitySourceRevision(container, { gameId, operatorId, expectedPlanSha256: plan.planSha256 });
  expect(await identityRevisionPending(db, gameId)).toBe(true); expect(await job()).toEqual(parked);
  if (capacity) {
    // Finish the historical free continuation first, as the live source turn did.
    // The short slice must defer before any replacement image or HIGH question is bought.
    expect((await advanceIdentitySourceRevision(container, { gameId, operatorId, deadlineAt: Date.now() + 100_000 })).state).toBe("deferred");
    expect(sourceImageCalls).toBe(0);
    const { planLeanCompletionBudget, authorizeLeanCompletionBudget } = await import("../lean-completion-budget");
    const six = await planLeanCompletionBudget(container, gameId);
    await authorizeLeanCompletionBudget(container, { gameId, operatorId, expectedPlanSha256: six.planSha256 });
  }
  expect((await slice()).paused).toBe(true); expect(await job()).toEqual(parked);
  expect(await identityApprovedForDisplay(container, { identityAssetId: originalIdentity, originalPhotoAssetId: provenance.photoAssetId, ageYears: 8 }, 12)).toBe(false);
  await expect(composeLocalPatchGame(container, gameId)).rejects.toThrow("reference revision");
  const reviewFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    sourceReviewCalls++; responseFormats.push(JSON.parse(String(init?.body)).response_format.type);
    if (loseReference && !mixed && sourceReviewCalls === 1) throw Error("synthetic lost replacement review");
    if (rejudge && sourceReviewCalls === 1) return Response.json({ model: "gpt-6.1-sol", service_tier: "default", usage: { prompt_tokens: 2000, completion_tokens: 400 },
      choices: [{ finish_reason: "stop", message: { content: "{synthetic-unreadable" } }] },
      { headers: { "x-request-id": "req_unreadable_source_" + gameId } });
    return Response.json({ model: "gpt-6.1-sol", service_tier: "default", usage: { prompt_tokens: 2000, completion_tokens: 400 },
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass",
      sourceFaceVisible: "pass", facialVolume: "pass", viewConsistency: "pass" }, reason: "Synthetic source volume and consistency only, not visual acceptance" }) } }] },
    { headers: { "x-request-id": `req_source_revision_review_${gameId}_${sourceReviewCalls}` } }); });
  vi.stubGlobal("fetch", reviewFetch);
  let result, refusal: unknown;
  for (let turn = 0; turn < 5; turn++) {
    try { result = await advanceIdentitySourceRevision(container, { gameId, operatorId }); } catch (error) { refusal = error; break; }
    if (result.state === "committed") break;
  }
  styleSpy.mockRestore();
  if (capFailure) {
    expect(String(refusal)).toContain("unchanged world cap");
    const audit = await budget.audit(worldId);
    expect(audit.capMicroUsd).toBe(4_000_000); expect(audit.overCapMicroUsd).toBe(0); expect(audit.remainingMicroUsd).toBeLessThan(900_000);
    const newUnknowns = audit.unknownRequestKeys.filter(key => !before.unknownRequestKeys.includes(key)); expect(newUnknowns.length).toBeGreaterThan(0);
    for (const key of newUnknowns) expect(await budget.readRequest(worldId, key)).toMatchObject({ state: "unknown", reserveMicroUsd: key.startsWith("wizard:identity-style:") ? 400_000 : 500_000 });
    for (let i = 0; i < before.unknownRequestKeys.length; i++) expect(await budget.readRequest(worldId, before.unknownRequestKeys[i]!)).toEqual(priorRequests[i]);
    expect(await identityRevisionPending(db, gameId)).toBe(true); expect(await job()).toEqual(parked);
    expect((await subjectUpgradeOf(db, gameId))?.identityAssetId).toBe(originalIdentity);
    expect((await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson).toBeNull(); expect(createCharacter.mock.calls.length).toBeLessThanOrEqual(3);
    console.info("synthetic-reference-cap-refusal", { committedMicroUsd: audit.committedMicroUsd, remainingMicroUsd: audit.remainingMicroUsd, newUnknowns: newUnknowns.length });
    return;
  }
  if (refusal) throw refusal;
  expect(result?.state).toBe("committed");
  if (rejudge) {
    expect(sourceImageCalls).toBe(1); expect(sourceReviewCalls).toBe(2); expect(responseFormats).toEqual(["json_object", "json_schema"]);
    expect(await db.auditLog.count({ where: { entityId: gameId, action: "generation:identity-source-revision-candidate" } })).toBe(1);
  }
  expect(createCharacter).toHaveBeenCalledTimes(loseReference ? 2 : 1);
  expect(reviewFetch).toHaveBeenCalledTimes(rejudge ? 2 : 1);
  expect(await identityRevisionPending(db, gameId)).toBe(false);
  expect((await job()).attempts).toBe(parked.attempts); expect((await job()).status).toBe("QUEUED");
  const effective = (await subjectUpgradeOf(db, gameId))!;
  expect(effective).toMatchObject({ version: "local-patch-subject-upgrade/identity-revision-v2", identitySha256: sha256Bytes(newSheet), identityRevision: { originalEnrollmentSha256: expect.any(String) } });
  expect(effective.identityAssetId).not.toBe(originalIdentity);
  expect(await db.auditLog.findUniqueOrThrow({ where: { id: originalEnrollment.id } })).toEqual(originalEnrollment);
  for (let i = 0; i < before.unknownRequestKeys.length; i++) expect(await budget.readRequest(worldId, before.unknownRequestKeys[i]!)).toEqual(priorRequests[i]);
  const retainedRows = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, select: { id: true, attempts: true, assetId: true, judgeJson: true } });
  expect(retainedRows.map(({ judgeJson: _review, ...image }) => image)).toEqual(previousRows.map(({ judgeJson: _review, ...image }) => image));
  for (const previous of previousRows) {
    const prior = JSON.parse(previous.judgeJson ?? "null");
    if (prior?.boardReview?.dual?.subject) expect(JSON.parse(retainedRows.find(row => row.id === previous.id)!.judgeJson!).boardReview).toEqual(prior.boardReview);
  }
  const formerAccepted = previousRows.find(row => JSON.parse(row.judgeJson ?? "null")?.boardReview?.dual?.subject);
  expect(formerAccepted).toBeTruthy(); expect(subjectStageCurrent(formerAccepted!, effective.identitySha256)).toBe(false);
  expect((await advanceIdentitySourceRevision(container, { gameId, operatorId })).state).toBe("committed");
  expect(createCharacter).toHaveBeenCalledTimes(loseReference ? 2 : 1);
  let afterCapacityGrant = -1, defaultInterrupted = false;
  const trace: { i: number; hideId: string; paint: number; kind: string; tier: unknown; granted: boolean; evidenceAttempt: string | null; identity: string | null;
    image: string | null; geometry: string | null; decidedAt: number | null }[] = [];
  const prompts: string[] = [];
  let grantedAt = Infinity;
  let capacityBaseline: Awaited<ReturnType<typeof budget.readRequest>>[] = [];
  const capacityKeys: string[] = [];
  const defaultTarget = HIDES.filter(h => !special.has(h.id)).at(-1)!;
  if (capacity) {
    const cohort = new Set<string>();
    const originalCreate = provider.fake.create, originalRead = provider.fake.retrieve;
    const overloaded = new Map<string, { tier: "flex" | "default"; reads: number }>(); let granted = false;
    provider.fake.create = async body => {
      const prompt = (body.input as { content: { text?: string }[] }[])[0]!.content[0]!.text!;
      const bound = boundHide(prompt), bundle = prompt.includes(SUBJECT_QUALITY_BUNDLE_VERSION);
      const result = await originalCreate(body);
      prompts.push(prompt);
      // When this question was decided: its round's intent, written before its create (and before any reservation).
      const digest = createHash("sha256").update(JSON.stringify(body)).digest("hex");
      const intent = await db.auditLog.findFirst({ where: { entityId: gameId, action: SOL_BACKGROUND_ACTION, id: { endsWith: "_intent" }, metaJson: { contains: digest } } });
      trace.push({ i: provider.creates.length - 1, hideId: bound.hideId, paint: bound.attempts, kind: bundle ? "bundle" : "continuity", tier: body.service_tier, granted,
        evidenceAttempt: /Evidence attempt: (\d+)/.exec(prompt)?.[1] ?? null, identity: /"identitySha256":"([0-9a-f]{8})/.exec(prompt)?.[1] ?? null,
        image: /"imageSha256":"([0-9a-f]{16})/.exec(prompt)?.[1] ?? null, geometry: /"geometrySha256":"([0-9a-f]{16})/.exec(prompt)?.[1] ?? null,
        decidedAt: intent?.createdAt.getTime() ?? null });
      if (!granted && body.service_tier === "flex" && !special.has(bound.hideId) && (cohort.has(bound.hideId) || cohort.size < 6)) {
        cohort.add(bound.hideId); overloaded.set(result.responseId, { tier: "flex", reads: 0 });
      }
      if (granted && body.service_tier === "default" && bound.hideId === defaultTarget.id && bundle && !defaultInterrupted) {
        defaultInterrupted = true; overloaded.set(result.responseId, { tier: "default", reads: 0 });
      }
      return result;
    };
    provider.fake.retrieve = async responseId => {
      const failure = overloaded.get(responseId);
      if (!failure) return originalRead(responseId);
      // A real background response is first in progress: both questions are sent before either terminal failure arrives.
      if (++failure.reads === 1) return { status: "in_progress" };
      return { status: "failed", reading: { responseId, raw: null, usage: null, model: "gpt-6.1-sol", finishReason: "failed", serviceTier: failure.tier,
        providerError: { code: "server_is_overloaded", message: "Synthetic provider capacity outage" } } };
    };
    for (let turns = 0; turns < 900 && (await job()).currentStep !== "local-patch:needs-release"; turns++) {
      expect((await job()).status, "Capacity fixture must actually reach its old quota stop before READY").not.toBe("DONE");
      if ((await job()).currentStep === "local-patch:recovery-budget-wait") await db.generationJob.update({ where: { id: `job_${gameId}` },
        data: { updatedAt: new Date(Date.now() - LEAN_RECOVERY_BACKOFF_MS - 1000) } });
      await elapseEvidenceBackoff(); await slice();
    }
    console.info("synthetic-capacity-before-grant", { job: await job(), overloaded: overloaded.size,
      cohort: [...cohort], recentCreates: provider.creates.slice(-16), approvals: await budget.countContinuationApprovals(worldId) });
    expect((await job()).lastError).toMatch(/11\/12 under v3|12\/12 under v3/);
    for (let turns = 0; turns < 20 && (await backgroundReviewWaiting(db, gameId, { inFlightOnly: true })).size; turns++)
      await advanceContinuityInBackground(container, gameId);
    const { planLeanCapacityRecovery, authorizeLeanCapacityRecovery } = await import("../lean-capacity-recovery");
    const { leanCompletionBudgetAuditId } = await import("../lean-completion-budget");
    const recovery = await planLeanCapacityRecovery(container, gameId);
    const beforeGrant = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } }), heldJob = await job();
    const sixBefore = await db.auditLog.findUniqueOrThrow({ where: { id: leanCompletionBudgetAuditId(gameId) } });
    const historical = await budget.audit(worldId); capacityKeys.push(...historical.unknownRequestKeys);
    capacityBaseline = await Promise.all(capacityKeys.map(key => budget.readRequest(worldId, key)));
    await authorizeLeanCapacityRecovery(container, { gameId, operatorId, expectedPlanSha256: recovery.planSha256 });
    const { leanCapacityRecoveryId } = await import("../../../domain/generation/lean-capacity-recovery");
    grantedAt = (await db.auditLog.findUniqueOrThrow({ where: { id: leanCapacityRecoveryId(gameId) } })).createdAt.getTime();
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).toMatchObject({ snapshotJson: beforeGrant.snapshotJson, revision: beforeGrant.revision + 1 });
    expect(await job()).toEqual(heldJob); expect(await db.auditLog.findUniqueOrThrow({ where: { id: sixBefore.id } })).toEqual(sixBefore);
    granted = true; afterCapacityGrant = provider.creates.length;
    expect((await nextParkedWake(container))?.gameId).toBe(gameId);
    // Same eight historical unknowns as the live shape, with a conservative lost-image500k instead of a400k review.
    expect(before.unknownRequestKeys).toHaveLength(7);
    expect(capacityKeys.length).toBeGreaterThanOrEqual(8);
  }
  const ready = async () => !!(await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson;
  for (let turns = 0; turns < 900 && !await ready(); turns++) {
    if ((await job()).currentStep === "local-patch:recovery-budget-wait") await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { updatedAt: new Date(Date.now() - LEAN_RECOVERY_BACKOFF_MS - 1000) } });
    await elapseEvidenceBackoff(); await slice();
  }
  expect(await ready()).toBe(true);
  const rows = await db.targetVariantAsset.findMany({ where: { variant: "A", targetInstance: { gameScene: { gameId } } } });
  expect(rows).toHaveLength(27); expect(rows.every(row => row.status === "GENERATED" && subjectStageCurrent(row, effective.identitySha256))).toBe(true);
  const after = await budget.audit(worldId); expect(after.capMicroUsd).toBe(capacity ? 12_000_000 : 4_000_000);
  if (loseReference) {
    if (capacity) expect(after.unknownRequestKeys).toEqual(expect.arrayContaining([...before.unknownRequestKeys, "wizard:identity:2"]));
    else expect(after.unknownRequestKeys).toEqual([...before.unknownRequestKeys, "wizard:identity:2"]);
    expect(await budget.readRequest(worldId, "wizard:identity:2")).toMatchObject({ state: "unknown", reserveMicroUsd: 500_000 });
    expect(await budget.readContinuationApproval(worldId, "wizard:identity:2")).toMatchObject({ version: "world-unknown-continuation/v1", operatorId });
  } else expect(after.unknownRequestKeys).toEqual(before.unknownRequestKeys);
  expect(after.committedMicroUsd).toBeLessThanOrEqual(capacity ? 12_000_000 : 4_000_000);
  if (capacity) {
    const sentAfterGrant = trace.filter(one => one.granted);
    console.info("synthetic-capacity-after-grant", JSON.stringify({ afterCapacityGrant, grantedAt,
      flexSentAfterGrant: sentAfterGrant.filter(one => one.tier !== "default"), identities: [...new Set(trace.map(one => one.identity))] }));
    expect(defaultInterrupted).toBe(true);
    expect(sentAfterGrant.length).toBe(provider.creates.length - afterCapacityGrant);
    expect(sentAfterGrant.length).toBeGreaterThan(0);
    // One tier per round (R22): a round begun on Flex before the grant (its intent and reservation recorded) keeps its
    // exact keys and finishes its other question on Flex; every round begun after the grant is asked at the default tier.
    // A round: one evidence attempt about one candidate (its pixels, geometry, identity and painting); a self-repaired
    // candidate is a new binding with its own rounds, even where its pixels are unchanged.
    const roundOf = (one: typeof trace[number]) => `${one.hideId}:${one.identity}:${one.image}:${one.geometry}:${one.paint}:${one.evidenceAttempt}`;
    expect(trace.every(one => one.decidedAt !== null && one.image !== null && one.geometry !== null && one.identity !== null)).toBe(true);
    const begunOnFlexBeforeGrant = new Set(trace.filter(one => one.tier === "flex" && one.decidedAt! < grantedAt).map(roundOf));
    expect(sentAfterGrant.filter(one => one.tier !== "default" && !begunOnFlexBeforeGrant.has(roundOf(one)))).toEqual([]);
    // Nothing bought twice: each round asks each of its two questions once, whichever tier it is on.
    const asked = trace.map(one => `${roundOf(one)}:${one.kind}`);
    for (const [index, key] of asked.entries()) {
      const first = asked.indexOf(key);
      if (first === index) continue;
      const a = prompts[first]!, b = prompts[index]!;
      let at = 0; while (at < a.length && a[at] === b[at]) at++;
      console.info("synthetic-capacity-duplicate-round", JSON.stringify({ key, first: trace[first], again: trace[index], lengths: [a.length, b.length], at,
        a: a.slice(Math.max(0, at - 300), at + 500), b: b.slice(Math.max(0, at - 300), at + 500) }));
    }
    expect(asked.filter((key, index) => asked.indexOf(key) !== index)).toEqual([]);
    expect(provider.creates.slice(afterCapacityGrant).some(one => !provider.creates.slice(0, afterCapacityGrant).some(old => old.hideId === one.hideId))).toBe(true);
    expect(provider.creates.filter(one => one.hideId === defaultTarget.id && one.kind === "continuity")).toHaveLength(1);
    expect(new Set(provider.bodies).size).toBe(provider.bodies.length);
    for (let n = 0; n < capacityKeys.length; n++) expect(await budget.readRequest(worldId, capacityKeys[n]!)).toEqual(capacityBaseline[n]);
    expect((await budget.countContinuationApprovals(worldId))["world-automatic-review-recovery/v4"]).toBeGreaterThan(0);
    // Playable: READY at publication, DELIVERED once the world's ready mail is sent within the same slices.
    expect(["READY", "DELIVERED"]).toContain((await db.game.findUniqueOrThrow({ where: { id: gameId } })).status);
    // Publication purged the private photograph; the granted cap above still resolved after that purge.
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: `chl-${gameId}` } })).originalPhotoAssetId).toBeNull();
    console.info("synthetic-capacity-all27", { unknowns: after.unknownRequestKeys.length, reservedMicroUsd: after.reservedMicroUsd,
      committedMicroUsd: after.committedMicroUsd, capMicroUsd: after.capMicroUsd });
  }
  } finally { capacityClock?.mockRestore(); }
}, 1_500_000);

it.each(["default", "flex"] as const)("capacity recovery keeps an unfinished %s question on its exact key across review passes", async existingTier => {
  const gameId = `lean-capacity-pending-${existingTier}-synthetic`; await leanWorld(gameId);
  const pinModule = await import("../lean-capacity-recovery-pin");
  // This is a transport-policy boundary test. Full receipt/financial authority is tested separately against SQLite.
  let capacityGranted = existingTier === "default";
  const pin = vi.spyOn(pinModule, "leanCapacityRecoveryOf").mockImplementation(async (_db, id) => id === gameId && capacityGranted ? {} as never : null);
  const created: { hideId: string; tier: unknown; digest: string }[] = [];
  const fake: BackgroundReviewTransport = { namespace: "openai:find-me-existing", create: async body => {
    const prompt = (body.input as { content: { text?: string }[] }[])[0]!.content[0]!.text!;
    created.push({ hideId: boundHide(prompt).hideId, tier: body.service_tier, digest: sha256Bytes(Buffer.from(JSON.stringify(body))) });
    return { responseId: `resp_pending_default_${created.length}` };
  }, retrieve: async () => ({ status: "in_progress" }), cancel: async () => {} };
  const container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: fake } as Container, deps = painter(gameId, new Map(), new Map());
  try {
    await db.auditLog.create({ data: { id: leanReviewRecoveryAuditId(gameId), actorType: "SYSTEM", action: LEAN_REVIEW_RECOVERY_ACTION,
      entityType: "Game", entityId: gameId, metaJson: JSON.stringify(leanNewWorldRecoveryReceipt(gameId)) } });
    for (let turn = 0; turn < 5 && !created.length; turn++)
      await runLocalPatchWorldSlice(container, deps, gameId, { maxHides: 1, hardDeadlineAt: Date.now() + 270_000 });
    const first = created[0]; expect(first).toBeTruthy();
    const before = created.filter(one => one.hideId === first!.hideId); expect(before.length).toBeGreaterThan(0);
    expect(before.every(one => one.tier === existingTier)).toBe(true);
    capacityGranted = true;
    const { reviewLocalPatchBoard } = await import("../local-patch-board-review");
    const scene = await db.gameScene.findFirstOrThrow({ where: { gameId, sceneSlug: boardOf(first!.hideId).board } });
    await reviewLocalPatchBoard(container, { gameId, sceneId: scene.id }, { fence: async () => {} });
    await reviewLocalPatchBoard(container, { gameId, sceneId: scene.id }, { fence: async () => {} });
    expect(created.filter(one => one.hideId === first!.hideId)).toEqual(before);
    expect(new Set(created.map(one => one.digest)).size).toBe(created.length);
  } finally { pin.mockRestore(); }
}, 180_000);

it.each([false, true])("capacity recovery replays completed Flex answers at the first evidence attempt after an independent poll; recover unreadable continuity: %s", async badContinuity => {
  const gameId = `lean-capacity-completed-flex-${badContinuity}-synthetic`; await leanWorld(gameId);
  await db.auditLog.create({ data: { id: leanReviewRecoveryAuditId(gameId), actorType: "SYSTEM", action: LEAN_REVIEW_RECOVERY_ACTION,
    entityType: "Game", entityId: gameId, metaJson: JSON.stringify(leanNewWorldRecoveryReceipt(gameId)) } });
  const pinModule = await import("../lean-capacity-recovery-pin"); let granted = false, completed = false;
  const pin = vi.spyOn(pinModule, "leanCapacityRecoveryOf").mockImplementation(async (_db, id) => id === gameId && granted ? {} as never : null);
  const created: { hideId: string; tier: unknown; kind: "bundle" | "continuity"; digest: string }[] = [];
  const byResponse = new Map<string, typeof created[number]>();
  const fake: BackgroundReviewTransport = { namespace: "openai:find-me-existing", create: async body => {
    const prompt = (body.input as { content: { text?: string }[] }[])[0]!.content[0]!.text!, hideId = boundHide(prompt).hideId;
    const item = { hideId, tier: body.service_tier, kind: prompt.includes(SUBJECT_QUALITY_BUNDLE_VERSION) ? "bundle" as const : "continuity" as const,
      digest: sha256Bytes(Buffer.from(JSON.stringify(body))) };
    created.push(item); const responseId = `resp_completed_flex_${created.length}`; byResponse.set(responseId, item); return { responseId };
  }, retrieve: async responseId => {
    if (!completed) return { status: "in_progress" };
    const item = byResponse.get(responseId)!;
    return { status: "completed", reading: { responseId, raw: item.kind === "bundle" ? bundleAnswer(item.hideId, 3) : badContinuity && item.tier === "flex" ? "{synthetic-unreadable" : longAnswer(item.hideId, 400, 400, 160),
      usage: { input_tokens: 2000, output_tokens: 500 }, model: "gpt-6.1-sol", finishReason: "stop", serviceTier: String(item.tier) } };
  }, cancel: async () => {} };
  const container = { ...c, visualReview: { request: vi.fn() }, backgroundReview: fake } as Container;
  try {
    for (let turn = 0; turn < 5 && !created.length; turn++)
      await runLocalPatchWorldSlice(container, painter(gameId, new Map(), new Map()), gameId, { maxHides: 1, hardDeadlineAt: Date.now() + 270_000 });
    expect(created).toHaveLength(2); expect(created.every(item => item.tier === "flex")).toBe(true);
    const before = structuredClone(created); completed = true;
    await advanceContinuityInBackground(container, gameId);
    expect((await backgroundReviewWaiting(db, gameId, { inFlightOnly: true })).size).toBe(0);
    const scene = await db.gameScene.findFirstOrThrow({ where: { gameId, sceneSlug: boardOf(created[0]!.hideId).board } });
    const { reviewLocalPatchBoard } = await import("../local-patch-board-review");
    granted = true;
    await reviewLocalPatchBoard(container, { gameId, sceneId: scene.id }, { fence: async () => {} });
    expect(created).toEqual(before);
    expect(await boardWizardBudgetOf(container).audit(boardWizardWorldId(gameId))).toMatchObject({ pendingRequestKeys: [] });
    if (badContinuity) {
      const { prepareLocalPatchBoardReview } = await import("../local-patch-board-review");
      const prepared = await prepareLocalPatchBoardReview(container, { gameId, sceneId: scene.id }, {},
        { playerReview: true, includePlayerCandidates: true, skipApprovedEvidence: true, onlyHideId: created[0]!.hideId });
      expect(prepared.ready).toBe(true); if (!prepared.ready) throw Error("Synthetic same-pixel retry did not prepare");
      expect(prepared.evidenceReviewAttempt).toBe(2);
      const { buyDualLocalPatchReview } = await import("../local-patch-dual-review");
      await buyDualLocalPatchReview(container, prepared, { fence: async () => {} });
      expect(created.slice(before.length)).toEqual([expect.objectContaining({ hideId: created[0]!.hideId, kind: "continuity", tier: "default" })]);
      expect(created.filter(item => item.kind === "bundle")).toHaveLength(1);
    }
  } finally { pin.mockRestore(); }
}, 180_000);
