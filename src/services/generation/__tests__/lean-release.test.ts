import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import { createDraft } from "../../create-flow.service";
import { boardsOfWorlds } from "../../world-catalog.service";
import {
  LEAN_REVIEW_POLICIES, VISUAL_REVIEW_SOL_TIERS_PRICING_VERSION, leanReviewPolicy, leanReviewPolicyOf, visualReviewPolicy,
} from "../../../domain/generation/visual-review-policy";
import { visualReviewCharge } from "../../../infra/generation/visual-review-pricing";
import { solBackgroundReviewBody } from "../../../infra/generation/openai-background-review";
import { localPatchBoardsForVersion, localPatchBoardForVersion } from "../../../domain/scene/local-patch-catalog";
import { maskForHide } from "../../../domain/scene/local-patch-hides";
import { subjectPlanFor } from "../../../domain/generation/subject-policy";
import { LEAN_WARM_HAT_VERSION, LEAN_WARM_HAT_WARDROBE, SUBJECT_PAINTER_V3, SUBJECT_PAINTER_V4, isPlanLedPainter, subjectRenderDirectionV3,
  subjectRenderDirectionV4, subjectSupportPoseV4 } from "../../../domain/generation/subject-painter";
import { selfRepairRenderInstructions, type SelfRepairDecision } from "../../../domain/scene/local-patch-self-repair";
import { localPatchPrompt } from "../local-patch-prompt";
import { DUAL_VISUAL_REVIEW_V3, dualVisualReviewVersion } from "../visual-review-release";
import { LOCAL_PATCH_LOW_PAINTER, localPatchPainterRelease } from "../painter-release";
import { QUALITY_BATCH_CHANNEL, qualityChannelOf } from "../quality-channel";
import { newQaWorldBudgetAuditId, pinNewQaWorldBudget } from "../local-patch-qa-budget";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { applyBoardWizardBudgetCap } from "../board-wizard-budget";
import { activateLocalPatchEmergencyBudget, localPatchEmergencyBudgetAuditId } from "../local-patch-budget-recovery";
import { prepareVisualReview, visualReviewMaxCharge } from "../visual-review";
import { WorldBudgetError } from "../world-budget";
import {
  LEAN_WORLD_CAP_MICRO_USD, LOCAL_PATCH_LEAN_RELEASE, isLeanWorld, leanReleaseAuditId, leanReleaseOf, leanReleaseReceipt,
  pinLeanRelease, readLeanWorldBudget,
} from "../lean-release";
import { bill } from "./local-patch-fixtures";

/**
 * local-patch-lean/v1, its parts one by one: the Sol policies and their tier pricing, the background
 * request, the planned-look painter and the hat, the pin a new draft receives instead of the LOW painter,
 * Message Batches and six-dollar pins, and the four-dollar ceiling (target three) no extension can raise. No provider.
 */
const fakes = vi.hoisted(() => ({ appEnv: "qa", release: "v19" }));
vi.mock("../../../lib/env", () => ({
  env: () => ({ APP_ENV: fakes.appEnv, LOCAL_PATCH_PROMPT_RELEASE: fakes.release, GENERATION_ENABLED: "on",
    GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: fakes.appEnv, realGeneration: true, testers: [] }), flag: () => false, adminEmails: () => [],
}));

describe("the lean review policies", () => {
  it("leave every historical policy byte for byte, and name each lean one exactly", () => {
    // The paid fingerprints of every question bought before lean hash these exact objects.
    expect(JSON.stringify(visualReviewPolicy("scene-quality", "high"))).toBe('{"version":"visual-review-scene-quality-high/v1","role":"scene-quality","effort":"high","provider":"anthropic","model":"claude-opus-5-5","endpoint":"https://api.anthropic.com/v1/messages","maxOutputTokens":6500,"timeoutMs":240000,"pricingVersion":"visual-review-standard-2026-10-08"}');
    expect(JSON.stringify(visualReviewPolicy("head-continuity", "high"))).toBe('{"version":"visual-review-head-continuity-high/v1","role":"head-continuity","effort":"high","provider":"openai","model":"gpt-6.1-sol","endpoint":"https://api.openai.com/v1/chat/completions","maxOutputTokens":4096,"timeoutMs":240000,"pricingVersion":"visual-review-standard-2026-10-08"}');
    expect(JSON.stringify(visualReviewPolicy("head-continuity", "high", undefined, "responses-background"))).toBe('{"version":"visual-review-head-continuity-high-background/v1","role":"head-continuity","effort":"high","provider":"openai","model":"gpt-6.1-sol","endpoint":"https://api.openai.com/v1/responses","maxOutputTokens":4096,"timeoutMs":240000,"pricingVersion":"visual-review-standard-2026-10-08"}');
    expect(JSON.stringify(visualReviewPolicy("scene-quality", "high", "gpt-6.1-sol"))).toBe('{"version":"visual-review-scene-quality-sol-high/v1","role":"scene-quality","effort":"high","provider":"openai","model":"gpt-6.1-sol","endpoint":"https://api.openai.com/v1/chat/completions","maxOutputTokens":6500,"timeoutMs":240000,"pricingVersion":"visual-review-standard-2026-10-08"}');
    expect(LEAN_REVIEW_POLICIES.map(policy => [policy.version, policy.maxOutputTokens, policy.serviceTier])).toEqual([
      ["visual-review-scene-quality-sol-high-background-flex/lean-v1", 10_000, "flex"], ["visual-review-scene-quality-sol-high-background-default/lean-v1", 10_000, "default"],
      ["visual-review-head-continuity-sol-high-background-flex/lean-v1", 8_000, "flex"], ["visual-review-head-continuity-sol-high-background-default/lean-v1", 8_000, "default"]]);
    for (const policy of LEAN_REVIEW_POLICIES) {
      expect(policy).toMatchObject({ provider: "openai", model: "gpt-6.1-sol", effort: "high", endpoint: "https://api.openai.com/v1/responses",
        pricingVersion: VISUAL_REVIEW_SOL_TIERS_PRICING_VERSION });
      expect(leanReviewPolicyOf(policy.version)).toBe(policy);
      expect(visualReviewPolicy(policy.role, "high", "gpt-6.1-sol", "responses-background", policy.serviceTier)).toEqual(policy);
    }
    expect(leanReviewPolicyOf("visual-review-head-continuity-high-background/v1")).toBeNull();
    expect(() => leanReviewPolicy("scene-quality", "flex", "medium")).toThrow("Unsupported lean visual review");
    expect(() => leanReviewPolicy("scene-quality", "flex", "high", "claude-opus-5-5")).toThrow("Unsupported lean visual review");
  });

  it("prices an answer by the tier that served it: Flex at exactly half, the default tier at the standard card, anything else unknown", () => {
    const usage = { input_tokens: 13_442, output_tokens: 2_626, input_tokens_details: { cached_tokens: 442 } };
    const standard = visualReviewCharge(visualReviewPolicy("head-continuity", "high", undefined, "responses-background"), "gpt-6.1-sol", usage);
    for (const role of ["scene-quality", "head-continuity"] as const) {
      const flex = leanReviewPolicy(role, "flex");
      expect(visualReviewCharge(flex, "gpt-6.1-sol", usage, "default")).toEqual(standard);
      expect(visualReviewCharge(flex, "gpt-6.1-sol", usage, "flex")).toEqual({ costUnknown: false, costCents: standard.costCents / 2 });
      // A reservation (no served tier) is the standard card: a Flex request may be served at the default tier.
      expect(visualReviewCharge(flex, "gpt-6.1-sol", usage)).toEqual(standard);
      for (const tier of [null, "priority", "scale", "auto"]) expect(visualReviewCharge(flex, "gpt-6.1-sol", usage, tier).costUnknown).toBe(true);
      expect(visualReviewCharge(flex, "gpt-6.1-sol-mini", usage, "flex").costUnknown).toBe(true);
      expect(visualReviewCharge(flex, "gpt-6.1-sol", { prompt_tokens: 13_442, completion_tokens: 2_626 }, "flex").costUnknown).toBe(true);
    }
    // E3's measured Sol quality answer: 5.9865 cents at the standard card, 2.99325 on Flex.
    expect(visualReviewCharge(leanReviewPolicy("scene-quality", "flex"), "gpt-6.1-sol", { input_tokens: 13_442, output_tokens: 2_626 }, "default").costCents).toBeCloseTo(5.9865, 6);
    expect(visualReviewCharge(leanReviewPolicy("scene-quality", "flex"), "gpt-6.1-sol", { input_tokens: 13_442, output_tokens: 2_626 }, "flex").costCents).toBeCloseTo(2.99325, 6);
  });

  it("asks the tier its policy names, and every historical background question the default tier", async () => {
    const png = await sharp({ create: { width: 64, height: 96, channels: 3, background: "#808080" } }).png().toBuffer();
    const question = (role: "scene-quality" | "head-continuity", tier?: "flex" | "default") => prepareVisualReview({ role, effort: "high",
      ...(role === "head-continuity" ? { transport: "responses-background" as const } : { judge: "gpt-6.1-sol" as const, transport: "responses-background" as const }),
      ...(tier ? { tier } : {}), prompt: "Synthetic question", images: [png], labels: ["Synthetic label"] });
    expect(solBackgroundReviewBody(question("head-continuity"))).toMatchObject({ service_tier: "default", max_output_tokens: 4096 });
    expect(solBackgroundReviewBody(question("head-continuity", "flex"))).toMatchObject({ service_tier: "flex", max_output_tokens: 8_000, background: true, store: false });
    expect(solBackgroundReviewBody(question("scene-quality", "flex"))).toMatchObject({ service_tier: "flex", max_output_tokens: 10_000, model: "gpt-6.1-sol" });
    expect(solBackgroundReviewBody(question("scene-quality", "default"))).toMatchObject({ service_tier: "default" });
    // A lean question is its own purchase: never the historical one's fingerprint.
    expect(question("head-continuity", "flex").fingerprint).not.toBe(question("head-continuity").fingerprint);
    expect(question("head-continuity", "flex").fingerprint).not.toBe(question("head-continuity", "default").fingerprint);
    // Without a served tier the most a lean question can be billed is the standard card.
    expect(visualReviewMaxCharge(question("head-continuity", "flex"))).toMatchObject({ ok: true, outputTokens: 8_000 });
  });
});

describe("the lean painter: a planned look, MEDIUM, and the pushed-back hat", () => {
  const plans = localPatchBoardsForVersion(12).flatMap(board => board.hides.map(hide => ({ board, hide, plan: subjectPlanFor(board, hide.id) })));
  it("tells every appearance its own planned look as the look to draw, never the portrait or a three-quarter default", () => {
    for (const { board, hide, plan } of plans) {
      const text = subjectRenderDirectionV4(plan, 7);
      expect(text).toContain(SUBJECT_PAINTER_V4);
      expect(text).toContain(`LOOK: this appearance's own planned look, so the world's appearances differ from one another: head ${plan.head}; ${plan.gaze}; expression ${plan.expression}`);
      expect(text).toContain("never facing the viewer like the portrait");
      expect(text).toContain("Never crop, shorten, tidy or restyle the hair");
      expect(text).toContain("exactly 7 years old");
      expect(text).not.toContain("One natural option");
      expect(text.includes(`WARM HAT (${LEAN_WARM_HAT_VERSION})`)).toBe(plan.warmHat);
      const input = { ground: board.ground, pose: hide.pose, ageYears: 7, wardrobe: hide.wardrobe ?? board.wardrobe, placement: hide.placement,
        mask: maskForHide(hide), contentVersion: 12, hideId: hide.id, paintRecipe: "scene-integration-v8" as const };
      const v4 = localPatchPrompt({ ...input, subjectPainter: SUBJECT_PAINTER_V4 }), v3 = localPatchPrompt({ ...input, subjectPainter: SUBJECT_PAINTER_V3 });
      expect(v4).toContain(subjectSupportPoseV4(hide.pose));
      expect(v4).not.toContain("a readable three-quarter face is welcome");
      // Only the lean painter loses it: every earlier painter's wording is unchanged.
      expect(v3).toContain("a readable three-quarter face is welcome");
    }
    expect(isPlanLedPainter(SUBJECT_PAINTER_V4)).toBe(true);
    // The world's own plan already varies the looks: the three hides of a board never share a head or an expression.
    for (const board of localPatchBoardsForVersion(12)) {
      const own = plans.filter(p => p.board.board === board.board).map(p => p.plan);
      expect(new Set(own.map(p => p.head)).size).toBe(own.length);
      expect(new Set(own.map(p => p.expression)).size).toBe(own.length);
    }
  });

  it("paints the Antarctica hat as E6a did: pushed back, the face, eyebrows, hairline and hair at the brim visible", () => {
    const antarctica = localPatchBoardForVersion("antarctica", 12)!, plan = subjectPlanFor(antarctica, "antarctica-v12-1");
    expect(plan.warmHat).toBe(true);
    expect(LEAN_WARM_HAT_WARDROBE).toContain("worn pushed back off the forehead");
    expect(LEAN_WARM_HAT_WARDROBE).toContain("The whole face, both eyebrows, the hairline and the canonical hair at the brim and sides stay visible");
    expect(LEAN_WARM_HAT_WARDROBE).not.toContain("over the crown and the top of the hair");
    expect(subjectRenderDirectionV4(plan, 7)).toContain("worn pushed back off the forehead");
    // v3 keeps its own hat wording for the worlds that bought with it.
    expect(subjectRenderDirectionV3(plan, 7)).toContain("WARM HAT REQUIRED");
  });

  it("repaints with the refused codes and the located defects, and repairs a diagnosed redraw in v3's words", () => {
    const plan = subjectPlanFor(localPatchBoardForVersion("antarctica", 12)!, "antarctica-v12-2");
    const text = subjectRenderDirectionV4(plan, 6, { codes: ["photoLikeness", "requiredWardrobe", "collectionVariety", "perceivedAge"],
      located: ["photoLikeness: short dark hair instead of the long fringe"] });
    expect(text).toContain("refused for photoLikeness, requiredWardrobe, collectionVariety, perceivedAge");
    expect(text).toContain("VARIETY REPAIR: the refused painting repeated a look this world already shows on a third of its appearances. Draw exactly the planned look above.");
    expect(text).toContain("HAT REPAIR");
    expect(text).toContain("AGE REPAIR: the refused painting looked older than 6");
    expect(text).toContain('The reviewer located on the refused painting: "photoLikeness: short dark hair instead of the long fringe"');
    const decision: SelfRepairDecision = { cause: "drawing-defect", explanation: "Synthetic arms remain at the sides.", action: "redraw-with-new-placement", sourceKey: "synthetic",
      returnWindow: { left: 1, top: 1, width: 510, height: 766 }, protectedCore: { left: 40, top: 80, width: 300, height: 600 }, faceRect: { left: 80, top: 100, width: 70, height: 80 } };
    expect(selfRepairRenderInstructions(decision, "v3")).toContain("the pose follows the SUBJECT DIRECTION");
  });
});

let directory: string, db: PrismaClient, c: Container;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-lean-release-")));
  db = new PrismaClient({ datasources: { db: { url: "file:" + path.join(directory, "test.db").replaceAll("\\", "/") } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), analytics: { track: vi.fn() }, pinDualVisualReview: true, dualVisualReviewRelease: DUAL_VISUAL_REVIEW_V3,
    visualReview: { request: vi.fn() }, localPatchPainter: LOCAL_PATCH_LOW_PAINTER, qualityChannel: QUALITY_BATCH_CHANNEL } as unknown as Container;
}, 60_000);
beforeEach(() => { fakes.appEnv = "qa"; fakes.release = "v19";
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("No provider request permitted"); })); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
afterAll(async () => { await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-lean-release-")) rmSync(directory, { recursive: true }); });

/** A paid nine-board journey in generation, drafted under `container`. */
async function paidWorld(container: Container, beforePayment?: (gameId: string) => Promise<unknown>) {
  const draft = await createDraft(container, null, "he");
  await beforePayment?.(draft.gameId);
  const ownerId = "usr-" + draft.gameId, childId = "chl-" + draft.gameId;
  await db.user.create({ data: { id: ownerId, email: draft.gameId + "@example.invalid" } });
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Synthetic", ageYears: 6 } });
  await db.game.update({ where: { id: draft.gameId }, data: { ownerId, childProfileId: childId, status: "TARGETS_GENERATING", paidAt: new Date(), sceneCount: 9 } });
  await db.order.create({ data: { id: "ord-" + draft.gameId, gameId: draft.gameId, userId: ownerId, provider: "mock", packageTier: "ONE_WORLD",
    amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  await db.gameScene.createMany({ data: boardsOfWorlds(["journey"]).map((slug, orderIndex) => ({ id: `${draft.gameId}-s-${orderIndex}`,
    gameId: draft.gameId, sceneSlug: slug, sceneVersion: 12, orderIndex })) });
  await db.generationJob.create({ data: { id: "job_" + draft.gameId, gameId: draft.gameId, status: "QUEUED", stepsJson: "{}" } });
  return draft.gameId;
}
const lean = () => ({ ...c, leanRelease: LOCAL_PATCH_LEAN_RELEASE }) as Container;

describe("a lean draft's pin", () => {
  it("is written instead of the LOW painter, Message Batches and six-dollar pins, beside the dual review v3 pin", async () => {
    const gameId = await paidWorld(lean()), control = await paidWorld(c);
    expect(await leanReleaseOf(db, gameId)).toBe(LOCAL_PATCH_LEAN_RELEASE);
    expect(await dualVisualReviewVersion(db, gameId)).toBe(DUAL_VISUAL_REVIEW_V3);
    expect(await localPatchPainterRelease(db, gameId)).toBeNull();
    expect(await qualityChannelOf(db, gameId)).toBeNull();
    expect(await db.auditLog.findUnique({ where: { id: newQaWorldBudgetAuditId(boardWizardWorldId(gameId)) } })).toBeNull();
    // The same deployment without the lean release pins exactly what it always did.
    expect(await leanReleaseOf(db, control)).toBeNull();
    expect(await localPatchPainterRelease(db, control)).toBe(LOCAL_PATCH_LOW_PAINTER);
    expect(await qualityChannelOf(db, control)).toMatchObject({ channel: QUALITY_BATCH_CHANNEL });
    expect(await db.auditLog.findUnique({ where: { id: newQaWorldBudgetAuditId(boardWizardWorldId(control)) } })).not.toBeNull();
    expect(JSON.parse((await db.auditLog.findUniqueOrThrow({ where: { id: leanReleaseAuditId(gameId) } })).metaJson!)).toEqual(leanReleaseReceipt(gameId));
    expect(leanReleaseReceipt(gameId)).toMatchObject({ painter: "medium", worldCapMicroUsd: 4_000_000, automaticBudgetExtension: false,
      judges: { quality: "visual-review-scene-quality-sol-high-background-flex/lean-v1", continuity: "visual-review-head-continuity-sol-high-background-flex/lean-v1", fallbackTier: "default" } });
  });

  it("is refused outside QA, v19 and dual review v3, and on a draft that already carries another painter, channel or budget pin", async () => {
    // A bare v3 draft: no painter or channel pin, and (v18) no six-dollar pin.
    fakes.release = "v18";
    const bare = await createDraft({ ...c, localPatchPainter: undefined, qualityChannel: undefined } as Container, null, "he");
    const pin = () => db.$transaction(tx => pinLeanRelease(tx, bare.gameId, LOCAL_PATCH_LEAN_RELEASE));
    await expect(pin()).rejects.toThrow("The lean release is qualified only on QA with prompt release v19 and dual review v3");
    fakes.appEnv = "production"; fakes.release = "v19";
    await expect(pin()).rejects.toThrow("The lean release is qualified only on QA");
    await expect(db.$transaction(tx => pinLeanRelease(tx, bare.gameId, "local-patch-lean/v2" as never))).rejects.toThrow("Unsupported lean release");
    fakes.appEnv = "qa";
    await pin();
    expect(await leanReleaseOf(db, bare.gameId)).toBe(LOCAL_PATCH_LEAN_RELEASE);
    // A draft that already took the LOW painter, Message Batches and six dollars never also becomes lean.
    const control = await createDraft(c, null, "he");
    await expect(db.$transaction(tx => pinLeanRelease(tx, control.gameId, LOCAL_PATCH_LEAN_RELEASE)))
      .rejects.toThrow("without another painter, channel or budget pin");
  });

  it("is read exactly or refused, never as the nearest one", async () => {
    const gameId = await paidWorld(lean());
    expect(await isLeanWorld(db, gameId)).toBe(true);
    await db.auditLog.update({ where: { id: leanReleaseAuditId(gameId) }, data: { metaJson: JSON.stringify({ ...leanReleaseReceipt(gameId), worldCapMicroUsd: 6_000_000 }) } });
    await expect(leanReleaseOf(db, gameId)).rejects.toThrow("Pinned lean release is invalid; refusing a fallback");
  });
});

describe("a lean world's four-dollar ceiling", () => {
  it("is the ceiling every reservation meets, the status shows and no five-dollar extension raises", async () => {
    const gameId = await paidWorld(lean()), worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c);
    expect(await readLeanWorldBudget(c, worldId)).toMatchObject({ worldId, capMicroUsd: LEAN_WORLD_CAP_MICRO_USD });
    expect(await readLeanWorldBudget(c, boardWizardWorldId(await paidWorld(c)))).toBeNull();
    await budget.reserve(worldId, { requestKey: "earlier", scope: "image", operationFingerprint: "synthetic-earlier", reserveMicroUsd: 3_950_000 });
    await budget.settle(worldId, "earlier", bill(`earlier-${gameId}`, 3_950_000));
    expect(await budget.audit(worldId)).toMatchObject({ capMicroUsd: 4_000_000, remainingMicroUsd: 50_000 });
    let refused: unknown = null;
    try { await budget.reserve(worldId, { requestKey: "next-paint", scope: "image", operationFingerprint: "synthetic-next", reserveMicroUsd: 150_000 }); }
    catch (error) { refused = error; }
    expect(refused).toBeInstanceOf(WorldBudgetError);
    expect(refused).toMatchObject({ code: "cap_exceeded", refusedReservation: { worldId, requestKey: "next-paint", reserveMicroUsd: 150_000 } });
    // Even a refusal the five-dollar policy would extend (past four dollars, within five) is not extended for a lean world.
    const large = new WorldBudgetError("cap_exceeded", "Reservation exceeds the inclusive authorized QA world ceiling",
      { worldId, requestKey: "large-synthetic", scope: "image", operationFingerprint: "synthetic-large", reserveMicroUsd: 500_000 });
    await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "RUNNING", attempts: 1, currentStep: "local-patch" } });
    const fence = async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
      await tx.generationJob.updateMany({ where: { id: `job_${gameId}` }, data: { currentStep: "local-patch" } });
    };
    expect(await activateLocalPatchEmergencyBudget(c, gameId, large, fence)).toBe(false);
    expect(await db.auditLog.findUnique({ where: { id: localPatchEmergencyBudgetAuditId(worldId) } })).toBeNull();
    // The same refusal in the same world without its lean pin is extended: the lean pin alone decides.
    await db.auditLog.delete({ where: { id: leanReleaseAuditId(gameId) } });
    expect(await activateLocalPatchEmergencyBudget(c, gameId, large, fence)).toBe(true);
    // It comes first: a six-dollar pin that somehow sat beside a lean pin would raise nothing.
    const both = await paidWorld(lean(), id => db.$transaction(tx => pinNewQaWorldBudget(tx, id, "db", DUAL_VISUAL_REVIEW_V3)));
    expect(await db.auditLog.findUnique({ where: { id: newQaWorldBudgetAuditId(boardWizardWorldId(both)) } })).not.toBeNull();
    expect(await budget.audit(boardWizardWorldId(both))).toMatchObject({ capMicroUsd: 4_000_000 });
    // The board-wizard reading accepts only the known ceilings: four dollars, never three or three and a half.
    const audit = await budget.audit(worldId);
    expect(applyBoardWizardBudgetCap(audit, 4_000_000)).toMatchObject({ capMicroUsd: 4_000_000 });
    expect(() => applyBoardWizardBudgetCap(audit, 3_000_000)).toThrow("Unsupported verified QA budget cap");
    expect(() => applyBoardWizardBudgetCap(audit, 3_500_000)).toThrow("Unsupported verified QA budget cap");
  });
});
