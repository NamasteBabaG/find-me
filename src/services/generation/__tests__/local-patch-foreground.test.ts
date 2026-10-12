import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { INTEGRATED_COLLECTION_BOARDS } from "../../../../content/adventures/wizard-integrated-release";
import { cropOf, maskForHide, type LocalPatchHide } from "../../../domain/scene/local-patch-hides";
import { authoredLocalPatchForeground, LOCAL_PATCH_FOREGROUND_CLEARANCE_PX } from "../../../domain/scene/local-patch-foreground";
import { selfRepairDecisionSchema, type SelfRepairDecision } from "../../../domain/scene/local-patch-self-repair";
import { foregroundBound, foregroundDiagnosisData, foregroundForPinnedPrompt, foregroundPlanConflict, foregroundRecord, occludeLocalPatch } from "../local-patch-foreground";
import { foregroundContract, isAgeBodyPromptRelease, localPatchPrompt, paintRecipeForPinnedPrompt, pinnedLocalPatchPromptVersion,
  LOCAL_PATCH_AGE_BODY_PROMPT_VERSION, LOCAL_PATCH_AGE_BODY_PROP_PROMPT_VERSION, LOCAL_PATCH_AGE_PROMPT_VERSION, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION,
  LOCAL_PATCH_REFERENCE_NEUTRAL_PROMPT_VERSION } from "../local-patch-prompt";
import { renderLocalPatchHide, type LocalPatchRenderDeps } from "../local-patch-render";
import { composeBoundedLocalPatch } from "../local-patch-seam";
import { playerReviewEnabled } from "../local-patch-player-review";
import { recomputePaidPatchJoin } from "../local-patch-repair-compose";
import { localPatchForegroundPublishable } from "../local-patch-publication-policy";
import type { PurchaseLedger, RetainedPurchase, RetainedPurchaseStore } from "../paid-operation";
import type { WorldBudgetRequest, WorldChargeEvidence } from "../world-budget";
import { LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE } from "../../../infra/generation/openai-local-patch";

const BOARD = INTEGRATED_COLLECTION_BOARDS.find(b => b.hides.some(h => h.id === "newyork-v12-1"))!;
const NY = BOARD.hides.find(h => h.id === "newyork-v12-1")!;
const GW = INTEGRATED_COLLECTION_BOARDS.flatMap(b => b.hides).find(h => h.id === "greatwall-v12-1")!;
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const MAGENTA = { r: 230, g: 20, b: 200 };

/** A board whose every pixel differs from its neighbours, so "the board's own pixel" is checkable. */
async function patternBoard(width = 1200, height = 800) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 3; raw[p] = (x * 7) % 256; raw[p + 1] = (y * 5) % 256; raw[p + 2] = ((x + y) * 3) % 256;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}
/** The board crop with a flat "child" painted from the envelope down into the sign (crop x 220-290, y 400-740). */
async function painting(board: Buffer, hide: LocalPatchHide) {
  const child = await sharp({ create: { width: 70, height: 340, channels: 3, background: MAGENTA } }).png().toBuffer();
  const crop = await sharp(board).extract(cropOf(hide)).png().toBuffer();
  return sharp(crop).composite([{ input: child, left: 220, top: 400 }]).png().toBuffer();
}
const pixel = async (png: Buffer, x: number, y: number) => { const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true }); const p = (y * info.width + x) * 3; return [data[p], data[p + 1], data[p + 2]]; };

const evidence = (id: string): WorldChargeEvidence => ({ providerNamespace: "openai:find-me-existing", providerRequestId: id, usageId: `usage-${id}`,
  rawUsage: { total: 1 }, model: "gpt-image-2", amountMicroUsd: 47_000, costBasis: "provider-billed" });
function worker(paint: (style: Buffer) => Promise<Buffer>) {
  const rows = new Map<string, WorldBudgetRequest>(), retained = new Map<string, RetainedPurchase>(), dispatched: string[] = [];
  const ledger: PurchaseLedger = {
    readRequest: async (w, k) => rows.get(`${w} ${k}`) ?? null,
    reserve: async (w, i) => { if (rows.has(`${w} ${i.requestKey}`)) return { acquired: false };
      rows.set(`${w} ${i.requestKey}`, { ...i, origin: "reserved", state: "pending", unknownReasons: [], conflicts: [] } as unknown as WorldBudgetRequest); return { acquired: true }; },
    settle: async (w, k, ev) => { rows.set(`${w} ${k}`, { ...rows.get(`${w} ${k}`)!, state: "settled", evidence: ev } as WorldBudgetRequest); },
    markUnknown: async () => undefined,
  };
  const store: RetainedPurchaseStore = { put: async (w, k, v) => { retained.set(`${w} ${k}`, v); }, get: async (w, k) => retained.get(`${w} ${k}`) ?? null };
  const deps: LocalPatchRenderDeps = { ledger, store, renderPolicySha256: "p".repeat(64),
    render: async ({ requestKey, stylePng }) => { dispatched.push(requestKey); return { png: await paint(stylePng), rejected: null, quarantined: null, evidence: evidence(requestKey), unknownReason: null }; } };
  return { deps, dispatched, reserve: vi.spyOn(ledger, "reserve") };
}
const small = () => sharp({ create: { width: 64, height: 64, channels: 3, background: "#c8a078" } }).png().toBuffer();
async function render(deps: LocalPatchRenderDeps, board: Buffer, paintRecipe: "scene-integration-v6" | "scene-integration-v7", hide: LocalPatchHide = NY,
  selfRepair?: { cycle: number; decision: SelfRepairDecision }) {
  return renderLocalPatchHide(deps, { worldId: "fg-test", board: BOARD, hide, composedPng: board, identityPng: await small(), judgeIdentityPng: await small(),
    contentVersion: 12, paintRecipe, referenceMode: LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE, ageYears: 10, attempt: selfRepair ? 2 : 1, apiKey: "synthetic",
    ...(selfRepair ? { selfRepair } : {}) });
}
/** Codex's valid recovery plan from the v18 review (R1): the sign crosses its face. */
const CODEX_PLAN = selfRepairDecisionSchema.parse({ cause: "drawing-defect", explanation: "The new protected face is entirely inside the proposed return window.",
  action: "redraw-with-new-placement", sourceKey: "new-image", returnWindow: { left: 100, top: 580, width: 400, height: 187 },
  protectedCore: { left: 210, top: 620, width: 80, height: 120 }, faceRect: { left: 225, top: 695, width: 35, height: 35 } });
/** A plan whose protected child ends 14 px above the sign (its guard 2 px); the sign hides the feet below it. */
const CLEAR_PLAN = selfRepairDecisionSchema.parse({ ...CODEX_PLAN, explanation: "The protected child ends above the taxi sign, which hides the feet.",
  returnWindow: { left: 100, top: 300, width: 400, height: 460 }, protectedCore: { left: 210, top: 400, width: 80, height: 290 }, faceRect: { left: 225, top: 410, width: 35, height: 35 } });
type Rect = { left: number; top: number; width: number; height: number };
const within = (x: number, y: number, r: Rect) => x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height;
/** The repair join's inputs for a plan, with a 6 px feathered return window (as self-repair builds it). */
async function joinInput(plan: SelfRepairDecision, before: Buffer, rawPng: Buffer) {
  const r = plan.returnWindow, weights = Buffer.alloc(512 * 768);
  for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) weights[y * 512 + x] = Math.round(255 * Math.min(1,
    Math.max(0, Math.min(x - r.left, y - r.top, r.left + r.width - 1 - x, r.top + r.height - 1 - y) / 6)));
  const alphaPng = await sharp(weights, { raw: { width: 512, height: 768, channels: 1 } }).toColourspace("b-w").png().toBuffer();
  return { beforePng: before, rawPng, alphaPng, crop: { ...cropOf(NY) }, boardSize: { width: 3840 as const, height: 2160 as const },
    returnWindow: r, protectedCore: plan.protectedCore, faceRect: plan.faceRect };
}
/** Counted again, independently of the join: protected pixels that are not the retained painting's, and pixels outside the window that are not the board's. */
async function recount(candidatePng: Buffer, rawPng: Buffer, before: Buffer, plan: SelfRepairDecision) {
  const [out, raw, board] = await Promise.all([sharp(candidatePng).removeAlpha().raw().toBuffer(), sharp(rawPng).resize(512, 768, { fit: "fill" }).removeAlpha().raw().toBuffer(),
    sharp(before).extract(cropOf(NY)).removeAlpha().raw().toBuffer()]);
  const g = LOCAL_PATCH_FOREGROUND_CLEARANCE_PX, guard = { left: plan.protectedCore.left - g, top: plan.protectedCore.top - g,
    width: plan.protectedCore.width + 2 * g, height: plan.protectedCore.height + 2 * g };
  let protectedChanged = 0, outsideChanged = 0;
  for (let p = 0; p < 512 * 768; p++) {
    const x = p % 512, y = Math.floor(p / 512), at = (b: Buffer) => b.subarray(p * 3, p * 3 + 3);
    if (within(x, y, guard) && !at(out).equals(at(raw))) protectedChanged++;
    if (!within(x, y, plan.returnWindow) && !at(out).equals(at(board))) outsideChanged++;
  }
  return { protectedChanged, outsideChanged };
}

describe("v18: an authored fixed foreground", () => {
  it("is its own opt-in release; v15-v17 keep their exact recipes", () => {
    expect(pinnedLocalPatchPromptVersion(null, LOCAL_PATCH_AGE_PROMPT_VERSION, 12, "v18")).toBe(LOCAL_PATCH_FOREGROUND_PROMPT_VERSION);
    expect(pinnedLocalPatchPromptVersion(null, LOCAL_PATCH_AGE_PROMPT_VERSION, 12, "v17")).toBe(LOCAL_PATCH_AGE_BODY_PROP_PROMPT_VERSION);
    expect(pinnedLocalPatchPromptVersion(null, LOCAL_PATCH_AGE_PROMPT_VERSION, 12)).toBe(LOCAL_PATCH_REFERENCE_NEUTRAL_PROMPT_VERSION);
    expect(pinnedLocalPatchPromptVersion({ attempts: 1, promptVersion: LOCAL_PATCH_AGE_BODY_PROP_PROMPT_VERSION }, LOCAL_PATCH_AGE_PROMPT_VERSION, 12, "v18"))
      .toBe(LOCAL_PATCH_AGE_BODY_PROP_PROMPT_VERSION);
    expect(paintRecipeForPinnedPrompt(LOCAL_PATCH_FOREGROUND_PROMPT_VERSION)).toBe("scene-integration-v7");
    expect(isAgeBodyPromptRelease("v18")).toBe(true);
    for (const version of [LOCAL_PATCH_REFERENCE_NEUTRAL_PROMPT_VERSION, LOCAL_PATCH_AGE_BODY_PROMPT_VERSION, LOCAL_PATCH_AGE_BODY_PROP_PROMPT_VERSION, null])
      expect(foregroundForPinnedPrompt(NY, version)).toBeNull();
    expect(foregroundForPinnedPrompt(GW, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION)).toBeNull();
    expect(foregroundForPinnedPrompt(NY, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION)?.foreground).toBe(authoredLocalPatchForeground(NY.id));
  });

  it("asks v17's question plus one pinned sentence, and only where a hide has an outline", () => {
    const ask = (hide: LocalPatchHide, paintRecipe: "scene-integration-v6" | "scene-integration-v7") => localPatchPrompt({ paintRecipe, contentVersion: 12,
      ground: "pedestrian park paths", pose: hide.pose, ageYears: 10, wardrobe: "A teal jacket and dark trousers.", placement: hide.placement, mask: maskForHide(hide), hideId: hide.id });
    const contract = foregroundContract(authoredLocalPatchForeground(NY.id)!);
    expect(ask(NY, "scene-integration-v7")).toBe(`${ask(NY, "scene-integration-v6")}\n${contract}`);
    expect(ask(GW, "scene-integration-v7")).toBe(ask(GW, "scene-integration-v6"));
    expect(createHash("sha256").update(contract).digest("hex").slice(0, 16)).toBe("ffeb8a3fccc88a5c");
    expect(contract).toContain("The taxi roof sign \"7E95\" and the yellow taxi roof");
    expect(contract).toMatch(/never move, resize, shorten, copy or redraw them/);
  });

  it("restores exactly the board's own pixels under the outline and nothing else", async () => {
    const board = await patternBoard(), crop = await sharp(board).extract(cropOf(NY)).png().toBuffer(), painted = await painting(board, NY);
    const applied = foregroundForPinnedPrompt(NY, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION)!;
    const { png, restoredPixels } = await occludeLocalPatch(painted, crop, applied);
    expect(restoredPixels).toBe(10925);
    const [out, b, p] = await Promise.all([png, crop, painted].map(x => sharp(x).removeAlpha().raw().toBuffer()));
    let wrong = 0, unchanged = 0;
    for (let i = 0; i < 512 * 768; i++) {
      const a = applied.alpha[i]!;
      for (let ch = 0; ch < 3; ch++) if (out![i * 3 + ch] !== Math.round((b![i * 3 + ch]! * a + p![i * 3 + ch]! * (255 - a)) / 255)) wrong++;
      if (!a && out!.subarray(i * 3, i * 3 + 3).equals(p!.subarray(i * 3, i * 3 + 3))) unchanged++;
    }
    expect(wrong).toBe(0);
    expect(unchanged).toBe(512 * 768 - 10925);
    await expect(occludeLocalPatch(await sharp(painted).resize(256, 384).png().toBuffer(), crop, applied)).rejects.toThrow("512x768");
  });

  it("a v18 painting ships the board's sign over the child; v17 ships the plain join it always did", async () => {
    const board = await patternBoard(), child = await sharp({ create: { width: 70, height: 340, channels: 3, background: MAGENTA } }).png().toBuffer();
    const paint = (style: Buffer) => sharp(style).composite([{ input: child, left: 220, top: 400 }]).png().toBuffer();
    const v18 = worker(paint), v17 = worker(paint);
    const a18 = await render(v18.deps, board, "scene-integration-v7"), a17 = await render(v17.deps, board, "scene-integration-v6");
    expect(a18).toMatchObject({ accepted: true, promptVersion: LOCAL_PATCH_FOREGROUND_PROMPT_VERSION });
    expect(a17).toMatchObject({ accepted: true, promptVersion: LOCAL_PATCH_AGE_BODY_PROP_PROMPT_VERSION });
    const boardAt = (x: number, y: number) => pixel(board, cropOf(NY).left + x, cropOf(NY).top + y);
    // Inside the sign: the board for v18, the painted child for v17. Above the sign: the child for both.
    expect(await pixel(a18.shippingPng!, 250, 735)).toEqual(await boardAt(250, 735));
    expect(await pixel(a17.shippingPng!, 250, 735)).toEqual([MAGENTA.r, MAGENTA.g, MAGENTA.b]);
    for (const a of [a18, a17]) expect(await pixel(a.shippingPng!, 250, 680)).toEqual([MAGENTA.r, MAGENTA.g, MAGENTA.b]);
    expect(a18.foreground).toEqual({ version: "local-patch-foreground/v1", hideId: NY.id, polygonSha256: "4be0c68ac7ca32ebbcd5790b538a573d88a9f9785b235d55a7c1688bcb3a640f",
      alphaSha256: "7f2e115b8961a46ad647195fef56bd06ebacc2c2452098687b9b5cc737cd2f67", restoredPixels: 10925, imageSha256: a18.judgedSha256 });
    expect(a18.judgedSha256).toBe(sha(a18.shippingPng!));
    expect(a17.foreground).toBeUndefined();
    // v17's composition is byte for byte the plain bounded join of its painting.
    const plain = await composeBoundedLocalPatch(board, cropOf(NY), await paint(await sharp(board).extract(cropOf(NY)).png().toBuffer()), maskForHide(NY),
      { requireAligned: !playerReviewEnabled(), playerReview: playerReviewEnabled() });
    expect(a17.shippingPng!.equals(await sharp(plain.candidate).extract(cropOf(NY)).png().toBuffer())).toBe(true);
    // A replay re-derives the same restored picture from the retained painting.
    const again = await render(v18.deps, board, "scene-integration-v7");
    expect(again).toMatchObject({ replayed: true, judgedSha256: a18.judgedSha256, foreground: a18.foreground });
    expect(v18.dispatched).toHaveLength(1);
  });

  it("refuses an outline that would cover the envelope before reserving or painting, never skipping it", async () => {
    const board = await patternBoard(), w = worker(async style => style);
    const covered: LocalPatchHide = { ...NY, mask: { ...maskForHide(NY), height: 380 } };
    await expect(render(w.deps, board, "scene-integration-v7", covered)).rejects.toThrow(/LOCAL_PATCH_FOREGROUND: newyork-v12-1: the outline covers the authored envelope/);
    expect(w.reserve).not.toHaveBeenCalled();
    expect(w.dispatched).toEqual([]);
  });

  it("restores the outline in the self-repair join too, bound to the repaired picture", async () => {
    const before = await sharp({ create: { width: 3072, height: 2048, channels: 3, background: "#5a6f80" } }).png().toBuffer();
    const crop = { ...cropOf(NY) }, rawPng = await sharp({ create: { width: 512, height: 768, channels: 3, background: "#f08c28" } }).png().toBuffer();
    const r = { left: 100, top: 300, width: 400, height: 460 };
    const weights = Buffer.alloc(512 * 768);
    for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) weights[y * 512 + x] = Math.round(255 * Math.min(1,
      Math.max(0, Math.min(x - r.left, y - r.top, r.left + r.width - 1 - x, r.top + r.height - 1 - y) / 6)));
    const alphaPng = await sharp(weights, { raw: { width: 512, height: 768, channels: 1 } }).toColourspace("b-w").png().toBuffer();
    const input = { beforePng: before, rawPng, alphaPng, crop, returnWindow: r, protectedCore: { left: 210, top: 400, width: 80, height: 160 },
      faceRect: { left: 225, top: 410, width: 35, height: 35 } };
    const applied = foregroundForPinnedPrompt(NY, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION)!;
    const [plain, restored] = await Promise.all([recomputePaidPatchJoin(input), recomputePaidPatchJoin({ ...input, foreground: applied })]);
    const board = (await pixel(before, crop.left + 250, crop.top + 740));
    expect(await pixel(restored.candidatePng, 250, 740)).toEqual(board);
    expect(await pixel(plain.candidatePng, 250, 740)).toEqual([240, 140, 40]);
    for (const j of [plain, restored]) expect(await pixel(j.candidatePng, 250, 690)).toEqual([240, 140, 40]);
    expect(restored.foreground).toEqual(foregroundRecord(applied, 10925, restored.candidateSha256));
    expect(plain.foreground).toBeUndefined();
    expect(restored.audit).toMatchObject({ outsideChangedPixels: 0, protectedChangedPixels: 0 });
    expect(restored.audit).toEqual({ ...plain.audit });
  });
});

describe("v18 review R1: a recovery plan brings its own protected child, which the outline must clear", () => {
  const applied = foregroundForPinnedPrompt(NY, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION)!;
  /** A flat child painted over the plan's protected child and on down to the crop's foot. */
  const childOver = (core: Rect) => async (style: Buffer) => sharp(style).composite([{ input: await sharp({ create: { width: core.width, height: 760 - core.top,
    channels: 3, background: MAGENTA } }).png().toBuffer(), left: core.left, top: core.top }]).png().toBuffer();

  it("refuses Codex's plan before anything is reserved or painted; v17 buys and composes the same plan as it always did", async () => {
    expect(foregroundPlanConflict(applied, CODEX_PLAN)).toMatch(/over 710 pixels of faceRect and 4467 pixels of protectedCore with its 12px guard/);
    const board = await patternBoard(), v18 = worker(childOver(CODEX_PLAN.protectedCore)), v17 = worker(childOver(CODEX_PLAN.protectedCore));
    await expect(render(v18.deps, board, "scene-integration-v7", NY, { cycle: 1, decision: CODEX_PLAN }))
      .rejects.toThrow(/^LOCAL_PATCH_FOREGROUND: newyork-v12-1: The fixed foreground .* over 710 pixels of faceRect/);
    expect(v18.reserve).not.toHaveBeenCalled();
    expect(v18.dispatched).toEqual([]);
    const a17 = await render(v17.deps, board, "scene-integration-v6", NY, { cycle: 1, decision: CODEX_PLAN });
    expect(v17.reserve).toHaveBeenCalledTimes(1);
    expect(v17.dispatched).toEqual(["newyork-v12-1:" + NY.pose + ":self-repair:1"]);
    expect(a17.foreground).toBeUndefined();
    // No outline in v17: its plan's face keeps the painter's child where v18's would have had the sign.
    expect(await pixel(a17.shippingPng!, 240, 712)).toEqual([MAGENTA.r, MAGENTA.g, MAGENTA.b]);
  });

  it("a clear plan paints once, and the sign hides only what lies outside the protected child", async () => {
    expect(foregroundPlanConflict(applied, CLEAR_PLAN)).toBeNull();
    const board = await patternBoard(), w = worker(childOver(CLEAR_PLAN.protectedCore));
    const a18 = await render(w.deps, board, "scene-integration-v7", NY, { cycle: 1, decision: CLEAR_PLAN });
    expect(w.dispatched).toHaveLength(1);
    expect(a18.foreground).toEqual(foregroundRecord(applied, 10925, a18.judgedSha256!));
    const boardAt = (x: number, y: number) => pixel(board, cropOf(NY).left + x, cropOf(NY).top + y);
    // The painter's return region is the plan's child plus 120 px, down to the crop's foot: the face, the
    // protected child and the strip below it are the painting; under the sign, the board.
    for (const [x, y] of [[240, 420], [250, 550], [250, 689], [250, 700]] as const) expect(await pixel(a18.shippingPng!, x, y)).toEqual([MAGENTA.r, MAGENTA.g, MAGENTA.b]);
    for (const [x, y] of [[250, 740], [280, 720]] as const) expect(await pixel(a18.shippingPng!, x, y)).toEqual(await boardAt(x, y));
  });

  it("the join refuses the same plan, and only with the outline; the guard is the join's own 12 px", async () => {
    const before = await sharp({ create: { width: 3840, height: 2160, channels: 3, background: "#5a6f80" } }).png().toBuffer();
    const crop = await sharp(before).extract(cropOf(NY)).png().toBuffer();
    const raw = await childOver(CODEX_PLAN.protectedCore)(crop), input = await joinInput(CODEX_PLAN, before, raw);
    const plain = await recomputePaidPatchJoin(input);
    expect(plain.audit).toMatchObject({ protectedGuardPx: LOCAL_PATCH_FOREGROUND_CLEARANCE_PX, outsideChangedPixels: 0, protectedChangedPixels: 0 });
    expect(await recount(plain.candidatePng, raw, before, CODEX_PLAN)).toEqual({ protectedChanged: 0, outsideChanged: 0 });
    await expect(recomputePaidPatchJoin({ ...input, foreground: applied }))
      .rejects.toThrow(/^LOCAL_PATCH_REPAIR_COMPOSE: The fixed foreground .* over 710 pixels of faceRect and 4467 pixels of protectedCore/);
    // A face well clear of the sign, and a protected child whose 12 px guard reaches the sign's top row by one row (4 pixels).
    const near = (height: number) => selfRepairDecisionSchema.parse({ ...CLEAR_PLAN, protectedCore: { left: 250, top: 400, width: 80, height }, faceRect: { left: 260, top: 410, width: 35, height: 35 } });
    const at = async (plan: SelfRepairDecision) => recomputePaidPatchJoin({ ...await joinInput(plan, before, await childOver(plan.protectedCore)(crop)), foreground: applied });
    await expect(at(near(292))).rejects.toThrow(/over 0 pixels of faceRect and 4 pixels of protectedCore/);
    expect((await at(near(291))).audit).toMatchObject({ outsideChangedPixels: 0, protectedChangedPixels: 0 });
  });

  it("counts the audit against the retained painting: the protected child is the painter's, the feet under the sign are the board's", async () => {
    const before = await patternBoard(3840, 2160), crop = await sharp(before).extract(cropOf(NY)).png().toBuffer();
    const raw = await childOver(CLEAR_PLAN.protectedCore)(crop);
    const joined = await recomputePaidPatchJoin({ ...await joinInput(CLEAR_PLAN, before, raw), foreground: applied });
    expect(joined.audit).toMatchObject({ outsideChangedPixels: 0, protectedChangedPixels: 0 });
    expect(await recount(joined.candidatePng, raw, before, CLEAR_PLAN)).toEqual({ protectedChanged: 0, outsideChanged: 0 });
    expect(joined.foreground).toEqual(foregroundRecord(applied, 10925, joined.candidateSha256));
    // The painted child continues below the protected child (to 759); under the outline it is the board's, above it the painter's.
    const [out, b] = await Promise.all([sharp(joined.candidatePng).removeAlpha().raw().toBuffer(), sharp(crop).removeAlpha().raw().toBuffer()]);
    let hidden = 0, shown = 0;
    for (let y = CLEAR_PLAN.protectedCore.top + CLEAR_PLAN.protectedCore.height; y < 760; y++) for (let x = 210; x < 290; x++) {
      const p = (y * 512 + x) * 3, a = applied.alpha[y * 512 + x]!;
      if (a === 255 && out.subarray(p, p + 3).equals(b.subarray(p, p + 3))) hidden++;
      if (a === 0 && out.subarray(p, p + 3).equals(Buffer.from([MAGENTA.r, MAGENTA.g, MAGENTA.b]))) shown++;
    }
    expect(hidden).toBeGreaterThan(3500);
    expect(shown).toBeGreaterThan(800);
  });

  it("tells a v18 diagnosis the object, its bounds and the clearance before it plans", () => {
    expect(foregroundDiagnosisData(applied)).toEqual({ what: "The taxi roof sign \"7E95\" and the yellow taxi roof at the bottom of Image 1",
      bounds: { left: 160, top: 703, width: 282, height: 65 }, clearancePx: 12 });
  });
});

describe("v18 publication requires the outline on the exact picture", () => {
  const applied = foregroundForPinnedPrompt(NY, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION)!;
  const record = (image: string, restored = 10925) => foregroundRecord(applied, restored, image);
  it("binds the record to its outline, its hide and its picture", () => {
    expect(foregroundBound({ foreground: record("a") }, NY, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION, "a")).toBe(true);
    expect(foregroundBound({ foreground: record("a") }, NY, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION, "b")).toBe(false);
    expect(foregroundBound({}, NY, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION, "a")).toBe(false);
    expect(foregroundBound(null, NY, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION, "a")).toBe(false);
    expect(foregroundBound({ foreground: { ...record("a"), polygonSha256: "0".repeat(64) } }, NY, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION, "a")).toBe(false);
    expect(foregroundBound({ foreground: { ...record("a"), alphaSha256: "0".repeat(64) } }, NY, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION, "a")).toBe(false);
    expect(foregroundBound({ foreground: record("a", 0) }, NY, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION, "a")).toBe(false);
    // Rows that must not restore anything must not claim to.
    expect(foregroundBound({}, NY, LOCAL_PATCH_AGE_BODY_PROP_PROMPT_VERSION, "a")).toBe(true);
    expect(foregroundBound({ foreground: record("a") }, NY, LOCAL_PATCH_AGE_BODY_PROP_PROMPT_VERSION, "a")).toBe(false);
    expect(foregroundBound({}, GW, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION, "a")).toBe(true);
    expect(foregroundBound({ foreground: record("a") }, GW, LOCAL_PATCH_FOREGROUND_PROMPT_VERSION, "a")).toBe(false);
  });

  it("reads the row's pinned recipe, and never touches the database for hides with no outline and no claim", async () => {
    const findUnique = vi.fn(async () => ({ promptVersion: LOCAL_PATCH_FOREGROUND_PROMPT_VERSION as string | null }));
    const db = { targetVariantAsset: { findUnique } } as unknown as Prisma.TransactionClient;
    const binding = (hideId: string, judgeJson: unknown, sceneVersion = 12) => ({ gameId: "g", sceneVersion, hideId, variantId: "tva_1", attempts: 1,
      identityAssetId: "id", identitySha256: "i", assetId: "ast", imageSha256: "img", geometrySha256: "geo", judgeJson: JSON.stringify(judgeJson) });
    expect(await localPatchForegroundPublishable(db, binding(GW.id, { verdict: null }))).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
    expect(await localPatchForegroundPublishable(db, binding(NY.id, { verdict: null }))).toBe(false);
    expect(await localPatchForegroundPublishable(db, binding(NY.id, { foreground: record("img") }))).toBe(true);
    expect(await localPatchForegroundPublishable(db, binding(NY.id, { foreground: record("img") }, 11))).toBe(false);
    expect(await localPatchForegroundPublishable(db, binding(GW.id, { foreground: record("img") }))).toBe(false);
    findUnique.mockResolvedValueOnce({ promptVersion: LOCAL_PATCH_AGE_BODY_PROP_PROMPT_VERSION });
    expect(await localPatchForegroundPublishable(db, binding(NY.id, { verdict: null }))).toBe(true);
    findUnique.mockResolvedValueOnce(null as never);
    expect(await localPatchForegroundPublishable(db, binding(NY.id, { foreground: record("img") }))).toBe(false);
  });

  it("refuses a recovery candidate whose plan the outline would cut, even with a bound record; v17 has no such rule", async () => {
    const findUnique = vi.fn(async () => ({ promptVersion: LOCAL_PATCH_FOREGROUND_PROMPT_VERSION as string | null }));
    const db = { targetVariantAsset: { findUnique } } as unknown as Prisma.TransactionClient;
    const binding = (judgeJson: unknown) => ({ gameId: "g", sceneVersion: 12, hideId: NY.id, variantId: "tva_1", attempts: 3,
      identityAssetId: "id", identitySha256: "i", assetId: "ast", imageSha256: "img", geometrySha256: "geo", judgeJson: JSON.stringify(judgeJson) });
    expect(await localPatchForegroundPublishable(db, binding({ foreground: record("img"), selfRepair: { decision: CODEX_PLAN } }))).toBe(false);
    expect(await localPatchForegroundPublishable(db, binding({ foreground: record("img"), selfRepair: { decision: CLEAR_PLAN } }))).toBe(true);
    findUnique.mockResolvedValueOnce({ promptVersion: LOCAL_PATCH_AGE_BODY_PROP_PROMPT_VERSION });
    expect(await localPatchForegroundPublishable(db, binding({ selfRepair: { decision: CODEX_PLAN } }))).toBe(true);
  });
});
