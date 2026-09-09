import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { GameConfigSchema } from "../../../domain/game/config";
import { planScenePlay } from "../../../domain/game/replay";
import { targetGeometry } from "../../../game/engine/target-geometry";
import { prepareBoardPoseObservation, type BoardPoseObservationReceipt } from "../../../infra/generation/board-pose-observer";
import { prepareBoardConditionedSource, type BoardConditioningInput } from "../board-conditioned-source";
import { extractBoardSprites } from "../board-sprite-extraction";
import { composeSimplePeek, findSimplePeekCut } from "../simple-peek";
import { sha256Bytes } from "../fixed-sprite";
import { auditWorldBudget } from "../world-budget";
import { BOARD_PLAYER_REVIEW_DIMENSIONS, bindBoardConditionedPlayerGame, prepareBoardConditionedPlayerBoard,
  type BoardConditionedPlayerRequest, type BoardConditionedPrivateUrlReceipt, type BoardConditionedSemanticReview } from "../board-conditioned-player";

const sourcePolicy = { reserveMicroUsd: 200_000, providerNamespace: "synthetic:test", timeoutMs: 1000, rateCard: { id: "fixture", textInput: 5, imageInput: 8, imageOutput: 30 } };
const observerPolicy = { reserveMicroUsd: 300_000, providerNamespace: "synthetic:test", timeoutMs: 1000 };
const worldId = "fixture:world";
const bound = (png: Buffer) => ({ png, sha256: sha256Bytes(png) });
function clone<T>(v: T): T {
  if (Buffer.isBuffer(v)) return Buffer.from(v) as T;
  if (Array.isArray(v)) return v.map(clone) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, v]) => [k, clone(v)])) as T;
  return v;
}
let baseline: BoardConditionedPlayerRequest, exported: Awaited<ReturnType<typeof prepareBoardConditionedPlayerBoard>>;
beforeAll(async () => {
  const board = await sharp({ create: { width: 120, height: 120, channels: 4, background: "#384970" } }).png().toBuffer();
  const fg = await sharp({ create: { width: 120, height: 120, channels: 4, background: "transparent" } })
    .composite([{ input: await sharp({ create: { width: 120, height: 45, channels: 4, background: "#384970" } }).png().toBuffer(), left: 0, top: 75 }]).png().toBuffer();
  const input: BoardConditioningInput = { boardId: "tokyo", board: bound(board), child: { profileId: "fixture-child", ageYears: 8, illustratedIdentity: bound(board), referenceRole: "illustrated-identity" },
    slots: (["front-peek", "side-lean", "wave-peek"] as const).map((pose, i) => ({ slot: { id: `slot-${i}`, pose, eye: { x: 20 + i * 40, y: 50 }, faceHeightPx: 8,
      window: { left: i * 40, top: 0, width: 40, height: 120 }, forbiddenRects: [{ id: "original-face", left: i * 40, top: 0, width: 5, height: 5 }] }, foreground: bound(fg),
      context: { left: i * 40, top: 0, width: 40, height: 120 }, originalPeople: { left: i * 40, top: 0, width: 20, height: 30 }, poseDescription: `Natural ${pose} upper body`, wardrobe: "Muted red cotton cardigan",
      lighting: { key: "Cool night sky above", fill: "Blue violet ambient", shadows: "Grouped painted shadows", exposure: "Like nearby painted people" } })) };
  const rgba = Buffer.alloc(1024 * 1024 * 4);
  for (const x0 of [170, 512, 853]) for (let y = 140; y < 700; y++) for (let x = x0 - 60; x < x0 + 60; x++) rgba.set([150, 80, 60, 253], (y * 1024 + x) * 4);
  const sheet = await sharp(rgba, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
  const prepared = await prepareBoardConditionedSource(input, sourcePolicy);
  const observed = await prepareBoardPoseObservation({ sheetPng: sheet, slots: input.slots.map(s => ({ slotId: s.slot.id, pose: s.slot.pose })) }, observerPolicy);
  const evidence = { providerNamespace: "synthetic:test", providerRequestId: "synthetic-observer", usageId: "synthetic-observer", model: "gpt-5.6-sol", rawUsage: { tokens: 1 }, amountMicroUsd: 100, costBasis: "conservative-upper-estimate" as const };
  const measurement = { sheetSha256: sha256Bytes(sheet), fingerprint: observed.fingerprint, status: "ok" as const, evidence,
    sources: input.slots.map((s, i) => { const x = [170, 512, 853][i]!; return { slotId: s.slot.id, pose: s.slot.pose, eye: { x, y: 200 }, chin: { x, y: 250 },
      protectedFacePolygon: [{ x: x - 30, y: 175 }, { x: x + 30, y: 175 }, { x: x + 30, y: 249 }, { x: x - 30, y: 249 }] }; }) };
  const receipt: BoardPoseObservationReceipt = { version: "board-pose-observation-receipt/v1", fingerprint: observed.fingerprint,
    sourceImageSha256: observed.capture.sourceImageSha256, sourceRgbaSha256: observed.capture.sourceRgbaSha256,
    wireImageSha256: observed.capture.wireImageSha256, promptSha256: observed.capture.promptSha256, slots: observed.capture.slots,
    coordinates: "native-1024-sheet-pixel-edges", modelRequested: "gpt-5.6-sol", modelReturned: "gpt-5.6-sol", effort: "high",
    requestId: evidence.providerRequestId, responseId: "synthetic-response", httpStatus: 200, serviceTier: "default", finishReason: "stop",
    responseText: JSON.stringify({ figureCount: 3, extraProps: false, cells: measurement.sources.map(s => ({ slotId: s.slotId, pose: s.pose,
      poseMatches: true, visibleHeadArmsComplete: true, eye: { status: "observed", point: s.eye, confidence: .96, reason: "Visible pupil midpoint" },
      chin: { status: "observed", point: s.chin, confidence: .96, reason: "Visible chin" },
      protectedFacePolygon: { status: "observed", polygon: s.protectedFacePolygon, confidence: .96, reason: "Observed opaque inner face" } })), reason: "Three complete visible poses" }),
    rawUsage: { tokens: 1 }, costUnknown: false, costCents: .01, attempts: 1 };
  const extracted = await extractBoardSprites({ sheetPng: sheet, seeds: measurement.sources.map(s => ({ ...s,
    measurement: { kind: "observed" as const, note: `Sol HIGH source observation ${evidence.providerRequestId}; ${measurement.fingerprint}` } })) });
  const appearances = [];
  for (const d of input.slots) {
    if (d.slot.pose === "standing") throw new Error("This fixture exercises legacy clipped poses only");
    const sprite = extracted.sprites.find(s => s.slotId === d.slot.id)!;
    const uncut = { board: input.board, foreground: d.foreground, slot: { ...d.slot, pose: d.slot.pose }, source: { png: sprite.png, sha256: sprite.sha256, eye: sprite.eye, chin: sprite.chin, protectedFacePolygon: sprite.protectedFacePolygon, measurement: sprite.measurement } };
    const cut = await findSimplePeekCut(uncut, { minCutY: Math.ceil(sprite.chin.y + Math.hypot(sprite.chin.x - sprite.eye.x, sprite.chin.y - sprite.eye.y)) });
    expect(cut).not.toBeNull();
    const composite = await composeSimplePeek({ ...uncut, source: { ...uncut.source, lowerCutY: cut! } }); expect(composite.ok).toBe(true);
    appearances.push({ slotId: d.slot.id, state: "visual-review-required" as const, sprite, composite, completenessDeferred: null });
  }
  const boardPreviewPng = await sharp(board).composite(appearances.map(a => ({ input: a.composite.patchPng, left: 0, top: 0 }))).png().toBuffer();
  baseline = { worldId, input, sourcePolicy, observerPolicy, expectedContractSha256: prepared.contractSha256,
    result: { state: "review-required", boardId: input.boardId, contract: prepared.contract, contractSha256: prepared.contractSha256,
      source: { kind: "generated", png: sheet, pngSha256: sha256Bytes(sheet), fingerprint: prepared.prepared.fingerprint, capture: prepared.prepared.capture,
        evidence: { ...evidence, model: "gpt-image-2", providerRequestId: "synthetic-image" }, modelProvenance: "response-confirmed", audit: auditWorldBudget({ worldId, requests: [] }), semanticApproval: "pending" },
      measurement: { ...measurement, receipt }, extracted, appearances, boardPreviewPng, previewIsDiagnostic: false, reviewDimensions: BOARD_PLAYER_REVIEW_DIMENSIONS, automaticRelease: false } };
  exported = await prepareBoardConditionedPlayerBoard(baseline);
}, 30_000);

function binding() {
  const slot = { id: "legacy", x: .5, y: .5, scale: .2, rotation: 20, flip: true, zIndex: 10, layer: "behindForeground", hintZone: { x: .5, y: .5, r: .1 }, hintText: "Old hint" };
  const template = GameConfigSchema.parse({ version: 1, gameId: "private-fixture", locale: "en", child: { name: "Fixture Child", avatarUrl: "/private/avatar" }, styleVersion: "legacy", packageTier: "ONE_WORLD", composedAt: "2026-09-09T00:00:00.000Z",
    scenes: [{ slug: "tokyo", version: 1, name: "Tokyo", tagline: "Night market", artStatus: "final", art: { width: 120, height: 120, base: "/old.png", foreground: "/wrong-global-foreground.png", thumbnail: "/old.png", palette: { sky: "#123", ground: "#456", accent: "#789" } },
      targets: [0, 1, 2].map(i => ({ id: `target-${i}`, targetType: "legacy", difficulty: i + 1, mission: "Find Fixture Child", item: "Hidden child", success: ["Found!"], animation: "spin", slots: [slot, slot], sprite: { kind: "image", url: "/old-child.png", width: 10, height: 10 }, adjust: { dx: .1, dy: -.1, scale: 1.4 } })),
      ambient: [], celebration: { kind: "stars", completeText: "Well done" }, collectible: { id: "tokyo", name: "Tokyo", icon: "star" } }] });
  const receipts: BoardConditionedPrivateUrlReceipt[] = exported.assetWrites.map((a, i) => ({ key: a.key, sha256: a.sha256, rgbaSha256: a.rgbaSha256, width: a.width, height: a.height, url: `/authenticated-private/fixture-${i}`, access: "authenticated-private" }));
  return { boards: [clone(baseline)], template, receipts, targetSlots: [0, 1, 2].map(i => ({ boardId: "tokyo", targetId: `target-${i}`, slotId: `slot-${i}`, hintText: `Look behind cover ${i}` })) };
}
function successful(request: BoardConditionedPlayerRequest) {
  if (request.result.state !== "review-required") throw new Error("synthetic result required"); return request.result;
}

describe("engine and player agree about deferred visible completeness", () => {
  /** Rebuild the baseline with one cell the source reviewer could not settle. */
  function deferred(recordDeferral: boolean) {
    const request = clone(baseline);
    const result = successful(request);
    const answer = JSON.parse(result.measurement.receipt!.responseText!);
    answer.cells[1].visibleHeadArmsComplete = false;
    answer.reason = "The middle figure's lowered hand meets the lower artwork edge";
    result.measurement.receipt!.responseText = JSON.stringify(answer);
    result.measurement.completenessDeferred = recordDeferral
      ? [{ slotId: answer.cells[1].slotId, visibleHeadArmsComplete: false, reason: answer.reason }]
      : [];
    return request;
  }

  // The engine defers this question to composition; before this test the adapter
  // still applied the old source-only rule, so a cell the engine had legitimately
  // composed was refused again on its way to the player.
  it("carries a deferred cell through to player assets when the foreground really hides the cut", async () => {
    const game = await prepareBoardConditionedPlayerBoard(deferred(true));
    expect(game.manifest.placements).toHaveLength(3);
    expect(game.assetWrites.length).toBeGreaterThan(3);
  });

  it("refuses a deferral the settled measurement never recorded", async () => {
    await expect(prepareBoardConditionedPlayerBoard(deferred(false)))
      .rejects.toThrow(/Deferred completeness differs from the recorded measurement/);
  });

  it("still refuses a wrong gesture at the player boundary", async () => {
    const request = clone(baseline), result = successful(request);
    const answer = JSON.parse(result.measurement.receipt!.responseText!);
    answer.cells[1].poseMatches = false;
    result.measurement.receipt!.responseText = JSON.stringify(answer);
    await expect(prepareBoardConditionedPlayerBoard(request))
      .rejects.toThrow(/did not qualify three source figures/);
  });
});

describe("separate SimplePeek-to-existing-player adapter", () => {
  function reobserved() {
    const request = clone(baseline), result = successful(request);
    result.measurementAttempt = 2;
    result.measurementCharge = { requestKey: "board:tokyo:measure:2", scope: "judge", operationFingerprint: result.measurement.fingerprint,
      reserveMicroUsd: 400_000, origin: "reserved", unknownReasons: [], conflicts: [], state: "settled", evidence: clone(result.measurement.evidence) };
    return request;
  }
  it("pins selected observation2 to its exact settled charge without changing original pixels", async () => {
    const request = reobserved(), result = await prepareBoardConditionedPlayerBoard(request);
    expect(result.manifest).toMatchObject({ measurementAttempt: 2, measurementRequestKey: "board:tokyo:measure:2" });
    expect(result.manifest.measurementChargeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.playerBindingSha256).not.toBe(exported.playerBindingSha256);
    expect(result.assetWrites.map(a => a.sha256)).toEqual(exported.assetWrites.map(a => a.sha256));
    expect(exported.manifest).not.toHaveProperty("measurementAttempt");
    successful(request).measurementCharge!.requestKey = "attempt-2:board:tokyo:measure:2";
    expect((await prepareBoardConditionedPlayerBoard(request)).manifest.measurementRequestKey).toBe("attempt-2:board:tokyo:measure:2");
  });
  it.each(["missing", "first-key", "wrong-board", "pending", "fingerprint", "evidence", "relabel"])("rejects mismatched observation2 billing selection (%s)", async reason => {
    const request = reobserved(), result = successful(request), charge = result.measurementCharge!;
    if (reason === "missing") delete result.measurementCharge;
    if (reason === "first-key") charge.requestKey = "board:tokyo:measure:1";
    if (reason === "wrong-board") charge.requestKey = "board:sydney:measure:2";
    if (reason === "pending") result.measurementCharge = { ...charge, state: "pending" };
    if (reason === "fingerprint") charge.operationFingerprint = "a".repeat(64);
    if (reason === "evidence" && "evidence" in charge) charge.evidence.providerRequestId = "different-paid-request";
    if (reason === "relabel") delete result.measurementAttempt;
    await expect(prepareBoardConditionedPlayerBoard(request)).rejects.toThrow(/observation|charge/i);
  });
  it("exports exact lossless premasked raster crops whose SceneViewport projection reconstructs every original board pixel", async () => {
    const result = successful(baseline), game = await bindBoardConditionedPlayerGame(binding());
    expect(game.privateReviewConfig.scenes).toHaveLength(1); expect(game.playableGameConfig).toBeNull();
    expect(game.privateReviewConfig.styleVersion.startsWith("fixed-sprite-")).toBe(true);
    expect(game).toMatchObject({ scope: "authenticated-private", automaticRelease: false, persistenceStatus: "not-written", semanticStatus: "pending", browserPixelParity: "unverified" });
    const scene = game.privateReviewConfig.scenes[0]!;
    expect(scene.art).not.toHaveProperty("foreground"); expect(scene).not.toHaveProperty("bonus");
    for (const [i, placement] of exported.manifest.placements.entries()) {
      const a = exported.assetWrites.find(a => a.key === placement.assetKey)!, raw = await sharp(a.png).raw().toBuffer();
      const expected = await sharp(result.appearances[i]!.composite!.patchPng).raw().toBuffer();
      const reconstructed = Buffer.alloc(120 * 120 * 4), r = placement.boardPixelRect;
      for (let y = 0; y < r.height; y++) raw.copy(reconstructed, ((r.top + y) * 120 + r.left) * 4, y * r.width * 4, (y + 1) * r.width * 4);
      expect(reconstructed).toEqual(expected); expect(sha256Bytes(a.png)).toBe(a.sha256);
      const target = scene.targets[i]!, geometry = targetGeometry(scene, target, "A"), sprite = geometry.sprite;
      if (sprite.kind !== "image" || !sprite.rect) throw new Error("image patch required");
      // Exactly the rect multiplication SceneViewport uses; no second rendering algorithm.
      expect(sprite.rect.x * 120).toBeCloseTo(r.left, 12); expect(sprite.rect.y * 120).toBeCloseTo(r.top, 12);
      expect(sprite.rect.w * 120).toBeCloseTo(a.width, 12); expect(sprite.rect.h * 120).toBeCloseTo(a.height, 12);
      expect(geometry.head).toEqual({ x: (20 + i * 40) / 120, y: 50 / 120 });
      expect(targetGeometry(scene, target, "B").sprite).toEqual(sprite);
      expect(target.slots[0]).toMatchObject({ flip: false, rotation: 0, layer: "front", zIndex: 30 });
      expect(target.adjust).toEqual({ dx: 0, dy: 0, scale: 1 });
    }
    expect(Object.values(planScenePlay(scene, { plays: 3 }, "fixture").variants)).toEqual(["A", "A", "A"]);
    expect(JSON.stringify(game.privateReviewConfig)).not.toContain("sourceSha256");
    expect(JSON.stringify(game.privateReviewConfig)).not.toContain("fixture-child");
  });

  it.each(["transform", "pixels", "lower-cut", "checks", "source", "extraction", "preview", "observed-eye", "contract"])("rejects recorded %s tampering instead of exporting a playable result", async field => {
    const request = clone(baseline), r = successful(request), a = r.appearances[0]!;
    if (!a.composite) throw new Error("fixture composite required");
    if (field === "transform") a.composite.transform.translateX += 1;
    if (field === "pixels") a.composite.patchPng[0] = 0;
    if (field === "lower-cut" && "lowerCutY" in a.composite.source) a.composite.source.lowerCutY++;
    if (field === "checks") a.composite.checks.forbiddenRegionsClear = false;
    if (field === "source") r.source.png[0] = 0;
    if (field === "extraction") r.extracted.sprites[0]!.png[0] = 0;
    if (field === "preview") r.boardPreviewPng[0] = 0;
    if (field === "observed-eye") r.measurement.sources![0]!.eye.x++;
    if (field === "contract") request.input.slots[0]!.slot.eye.x++;
    await expect(prepareBoardConditionedPlayerBoard(request)).rejects.toThrow();
  });

  it("rejects failed/diagnostic geometry and failed source states, without inventing standing support", async () => {
    const request = clone(baseline); successful(request).previewIsDiagnostic = true;
    await expect(prepareBoardConditionedPlayerBoard(request)).rejects.toMatchObject({ code: "source-rejected" });
    const a = clone(baseline), r = successful(a); r.appearances[0]!.state = "placement-review-required";
    await expect(prepareBoardConditionedPlayerBoard(a)).rejects.toMatchObject({ code: "geometry-rejected" });
    const b = clone(baseline); b.result = { state: "reconciliation-required", stage: "source", boardId: "tokyo", contractSha256: b.expectedContractSha256, automaticRelease: false };
    await expect(prepareBoardConditionedPlayerBoard(b)).rejects.toMatchObject({ code: "source-rejected" });
    expect(JSON.stringify(exported.manifest)).not.toMatch(/sole|standing|feet|seatPoint/);
  });

  it("requires exact private URL/hash/dimension receipts and complete target mapping", async () => {
    const a = binding(); a.receipts[1]!.sha256 = "0".repeat(64);
    await expect(bindBoardConditionedPlayerGame(a)).rejects.toMatchObject({ code: "asset-mismatch" });
    const b = binding(); b.receipts[1]!.width++;
    await expect(bindBoardConditionedPlayerGame(b)).rejects.toMatchObject({ code: "asset-mismatch" });
    const c = binding(); c.receipts[1]!.url = "data:image/png;base64,private";
    await expect(bindBoardConditionedPlayerGame(c)).rejects.toMatchObject({ code: "asset-mismatch" });
    const d = binding(); d.targetSlots[0]!.slotId = "wrong-slot";
    await expect(bindBoardConditionedPlayerGame(d)).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("rejects missing observer receipts and geometry disconnected from the original response", async () => {
    const a = clone(baseline); delete successful(a).measurement.receipt;
    await expect(prepareBoardConditionedPlayerBoard(a)).rejects.toMatchObject({ code: "source-rejected" });
    const b = clone(baseline), receipt = successful(b).measurement.receipt!;
    const json = JSON.parse(receipt.responseText!); json.cells[0].eye.point.x++;
    receipt.responseText = JSON.stringify(json);
    await expect(prepareBoardConditionedPlayerBoard(b)).rejects.toMatchObject({ code: "replay-mismatch" });
    const c = clone(baseline); successful(c).measurement.receipt!.wireImageSha256 = "0".repeat(64);
    await expect(prepareBoardConditionedPlayerBoard(c)).rejects.toMatchObject({ code: "source-rejected" });
  });

  it("requires exactly three distinct template targets with bidirectional mapping coverage", async () => {
    const a = binding(); a.template.scenes[0]!.targets.pop();
    await expect(bindBoardConditionedPlayerGame(a)).rejects.toThrow();
    const b = binding(); b.template.scenes[0]!.targets[2]!.id = b.template.scenes[0]!.targets[1]!.id;
    await expect(bindBoardConditionedPlayerGame(b)).rejects.toMatchObject({ code: "invalid-input" });
    const c = binding(); c.targetSlots[2]!.targetId = "unmapped-template-target";
    await expect(bindBoardConditionedPlayerGame(c)).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("strips nine-node world maps and world completion from a one-board private preview", async () => {
    const input = binding();
    input.template.world = { slug: "journey", version: 1, name: "Journey", tagline: "World", intro: "Explore", map: { width: 100, height: 100, art: "/map.png", palette: { sky: "blue", ground: "white", accent: "red" } },
      nodes: Array.from({ length: 9 }, (_, i) => ({ boardSlug: i === 0 ? "tokyo" : `absent-${i}`, routeIndex: i + 1, x: .5, y: .5, labelAnchor: "top" as const, markerScale: 1, travelStyle: "walk" as const })),
      collectible: { id: "world", name: "World", piece: "Star", icon: "star" }, completion: { title: "Completed all nine", text: "Nine boards finished", icon: "star" } };
    input.template.worlds = [input.template.world]; input.template.scenes[0]!.worldSlug = "journey";
    const result = await bindBoardConditionedPlayerGame(input);
    expect(result.privateReviewConfig).not.toHaveProperty("world"); expect(result.privateReviewConfig).not.toHaveProperty("worlds");
    expect(result.privateReviewConfig.scenes[0]).not.toHaveProperty("worldSlug"); expect(result.fullWorld).toBe(false);
  });

  it("replays phase one again, so a forged edited manifest cannot bypass frozen geometry", async () => {
    const a = binding(); successful(a.boards[0]!).appearances[0]!.composite!.transform.translateX += 20;
    await expect(bindBoardConditionedPlayerGame(a)).rejects.toMatchObject({ code: "replay-mismatch" });
    const b = binding(); b.template.scenes[0]!.art.width++;
    await expect(bindBoardConditionedPlayerGame(b)).rejects.toMatchObject({ code: "asset-mismatch" });
  });

  it("blocks playable export until explicit semantic approval binds these exact raster assets and placements", async () => {
    const input = binding();
    await expect(bindBoardConditionedPlayerGame({ ...input, mode: "reviewed-playable" })).rejects.toMatchObject({ code: "review-required" });
    const review: BoardConditionedSemanticReview = { version: "board-conditioned-semantic-review/v1", worldId, boardId: "tokyo", playerBindingSha256: exported.playerBindingSha256,
      approved: true, reviewedBy: "synthetic-test-only-reviewer", reviewedAt: "2026-09-09T00:00:00.000Z", checks: Object.fromEntries(BOARD_PLAYER_REVIEW_DIMENSIONS.map(k => [k, true])) as BoardConditionedSemanticReview["checks"] };
    const approved = await bindBoardConditionedPlayerGame({ ...input, mode: "reviewed-playable", semanticReviews: [review] });
    expect(approved.playableGameConfig).toEqual(approved.privateReviewConfig); expect(approved.automaticRelease).toBe(false);
    expect(approved.reviewerAuthorityVerification).toBe("trusted-caller-required");
    await expect(bindBoardConditionedPlayerGame({ ...input, mode: "reviewed-playable", semanticReviews: [{ ...review, playerBindingSha256: "0".repeat(64) }] })).rejects.toMatchObject({ code: "review-required" });
  });

  it("keeps explicit probe assemblies private and refuses missing or forged scope mappings", async () => {
    const input = binding();
    const privateProbeScopes = [{ boardId: "tokyo", sourceWorldId: worldId }];
    const result = await bindBoardConditionedPlayerGame({ ...input, privateProbeScopes });
    expect(result.playableGameConfig).toBeNull();
    expect(result.semanticStatus).toBe("pending");
    await expect(bindBoardConditionedPlayerGame({ ...input, privateProbeScopes, mode: "reviewed-playable" })).rejects.toMatchObject({ code: "invalid-input" });
    await expect(bindBoardConditionedPlayerGame({ ...input, privateProbeScopes: [] })).rejects.toMatchObject({ code: "invalid-input" });
    await expect(bindBoardConditionedPlayerGame({ ...input, privateProbeScopes: [{ boardId: "tokyo", sourceWorldId: "wrong" }] })).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("owns detached input/output bytes and rejects mixed world/child or duplicate boards", async () => {
    const a = clone(baseline), pending = prepareBoardConditionedPlayerBoard(a); successful(a).source.png.fill(0);
    expect((await pending).playerBindingSha256).toBe(exported.playerBindingSha256);
    const output = await prepareBoardConditionedPlayerBoard(baseline); output.assetWrites[0]!.png.fill(0);
    expect(baseline.input.board.sha256).toBe(sha256Bytes(baseline.input.board.png));
    await expect(bindBoardConditionedPlayerGame({ ...binding(), boards: [baseline, baseline] })).rejects.toMatchObject({ code: "invalid-input" });
  });
});
