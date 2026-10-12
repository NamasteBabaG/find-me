import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { INTEGRATED_COLLECTION_BOARDS } from "../../../../content/adventures/wizard-integrated-release";
import { cropOf, maskForHide, type LocalPatchHide } from "../../../domain/scene/local-patch-hides";
import { authoredLocalPatchForeground } from "../../../domain/scene/local-patch-foreground";
import { foregroundBound, foregroundForPinnedPrompt, foregroundRecord, occludeLocalPatch } from "../local-patch-foreground";
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
async function render(deps: LocalPatchRenderDeps, board: Buffer, paintRecipe: "scene-integration-v6" | "scene-integration-v7", hide: LocalPatchHide = NY) {
  return renderLocalPatchHide(deps, { worldId: "fg-test", board: BOARD, hide, composedPng: board, identityPng: await small(), judgeIdentityPng: await small(),
    contentVersion: 12, paintRecipe, referenceMode: LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE, ageYears: 10, attempt: 1, apiKey: "synthetic" });
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
});
