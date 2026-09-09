import sharp from "sharp";
import assert from "node:assert/strict";
import { SceneDefinitionSchema } from "../../../../domain/scene/schema";
import { WorldDefinitionSchema } from "../../../../domain/world";
import { adaptFixedSpriteForPlayer } from "../../fixed-sprite-player";
import { computeFixedPlacement, extractSpriteCell, fixedSlotV3ContractSchema, sha256Bytes, sha256Rgba, type VisibleSpriteSource } from "../../fixed-sprite";
import { fixedWorldAppearanceSha256, fixedWorldJsonSha256, fixedWorldRuntimeSlot, frozenFixedWorldPlanSchema, type FixedWorldMaterializerInput, type QualifiedFixedWorldAppearance } from "../../fixed-world-materializer";
import type { WorldBudgetRequest, WorldBudgetScope } from "../../world-budget";

const text = (value: string) => ({ en: value, he: `עברית ${value}` });
const hash = (value: string) => sha256Bytes(Buffer.from(value));
const polygon = (x: number, y: number, w: number, h: number) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const request = (key: string, scope: WorldBudgetScope): WorldBudgetRequest => ({
  requestKey: key, scope, operationFingerprint: `operation:${key}`, reserveMicroUsd: 10_000, origin: "reserved", unknownReasons: [], conflicts: [], state: "settled",
  evidence: { providerNamespace: "test-account", providerRequestId: `provider:${key}`, usageId: `usage:${key}`, rawUsage: { tokens: 1 }, model: scope === "judge" ? "gpt-5.6-sol" : "gpt-image-2", amountMicroUsd: 10_000, costBasis: "conservative-upper-estimate" },
});
const requestRef = (key: string) => ({ requestKey: key, operationFingerprint: `operation:${key}` });
/**
 * Complete synthetic fixture for free unit/SQLite integration tests only.
 * The identity is a solid-color synthetic PNG, all pixels are painted rectangles, and the
 * qualification/review/browser receipts are fabricated test assertions.
 * No child, model call, semantic approval, or browser capture is represented.
 */
export async function createFixedWorldFixture(): Promise<FixedWorldMaterializerInput> {
  const names = Array.from({ length: 9 }, (_, i) => `board-${String.fromCharCode(97 + i)}`);
  const boardRaw = Buffer.alloc(320 * 320 * 4);
  for (let i = 0; i < boardRaw.length; i += 4) boardRaw.set([120, 80, 40, 255], i);
  const boardPng = await sharp(boardRaw, { raw: { width: 320, height: 320, channels: 4 } }).png().toBuffer();
  const board = { sha256: sha256Bytes(boardPng), width: 320, height: 320 };
  const foreground = { rgba: Buffer.alloc(boardRaw.length), width: 320, height: 320 };
  foreground.rgba.set(boardRaw.subarray(140 * 320 * 4), 140 * 320 * 4);
  const palette = { sky: "#fff", ground: "#aaa", accent: "#abc" };
  const oldSlot = (id: string) => ({ id, x: 0.8, y: 0.8, scale: 0.2, layer: "behindForeground", flip: true, rotation: 20, zIndex: 2, hintZone: { x: 0.8, y: 0.8, r: 0.2 }, hintText: text("Wrong legacy seat hint") });
  const scenes = names.map(slug => SceneDefinitionSchema.parse({
    id: `scene-${slug}`, slug, version: 1, active: true, artStatus: "final", name: text(slug), tagline: text("A board"),
    art: { ...board, base: `/boards/${slug}.png`, thumbnail: `/boards/${slug}-thumb.png`, foreground: `/boards/${slug}-legacy-foreground.png`, palette },
    targets: [1, 2, 3].map(id => ({ id: `target-${id}`, targetType: "old-seat", bodyTemplate: "seated-template", difficulty: id,
      mission: text("Old seated mission"), item: text("Old prop"), success: [text("Old action")], animation: "bounce", slots: [oldSlot(`old-${id}-a`), oldSlot(`old-${id}-b`)] })),
    ambient: [1, 2].map(id => ({ id: `ambient-${id}`, label: text("Ambient"), x: 0.8, y: 0.8, w: 0.1, h: 0.1, animation: "bounce" })),
    bonus: { id: "old-bonus", name: text("Bonus"), sprite: "/bonus.png", scale: 0.1, prompt: text("Find bonus"), slots: [oldSlot("bonus-a"), oldSlot("bonus-b")] },
    celebration: { kind: "confetti", completeText: text("Found {name}") }, collectible: { id: `${slug}-piece`, name: text("Stamp"), icon: "stamp" }, sounds: {},
  }));
  const world = WorldDefinitionSchema.parse({ slug: "journey", version: 1, order: 1, name: text("Journey"), tagline: text("Nine boards"), intro: text("Welcome {name}"), map: { width: 1536, height: 1024, art: "/world/map.png", palette },
    nodes: names.map((boardSlug, i) => ({ boardSlug, routeIndex: i + 1, x: 0.1, y: 0.1, labelAnchor: "bottom", markerScale: 0.09, travelStyle: "walk" })),
    collectible: { id: "passport", name: text("Passport"), piece: text("stamps"), icon: "book" }, completion: { title: text("Done"), text: text("Well done {name}"), icon: "star" } });
  const sourceRaw = Buffer.alloc(1024 * 1024 * 4);
  const paint = (x: number, y: number, w: number, h: number) => { for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) sourceRaw.set([90, 120, 180, 255], (py * 1024 + px) * 4); };
  paint(110, 100, 14, 15); paint(112, 115, 12, 40); paint(112, 155, 4, 30); paint(120, 155, 4, 30);
  const cell = { id: "standing", left: 0, top: 0, width: 1024, height: 1024 };
  const source: VisibleSpriteSource = {
    measurementVersion: "visible-face/v1", poseId: "standing", landmarks: { eyeMidpoint: { x: 117 / 1024, y: 105 / 1024 }, chin: { x: 117 / 1024, y: 112 / 1024 }, leftFoot: { x: 114 / 1024, y: 185 / 1024 }, rightFoot: { x: 122 / 1024, y: 185 / 1024 } },
    landmarkTolerancePx: 2, protectedFacePolygon: polygon(113 / 1024, 106 / 1024, 8 / 1024, 5 / 1024),
    measurementFrame: { rgbaSha256: sha256Rgba(sourceRaw, 1024, 1024), width: 1024, height: 1024, cell, coordinates: "cell-normalized-pixel-edges" },
  };
  const extracted = extractSpriteCell({ rgba: sourceRaw, width: 1024, height: 1024, grid: { cells: [cell] }, cellId: "standing", source,
    review: { sourceSha256: source.measurementFrame.rgbaSha256, cellId: "standing", figureCount: 1, completeFigure: true, extraProps: false, poseMatches: true, reviewer: "synthetic fixture" } });
  assert.equal(extracted.ok, true, "synthetic source extraction must pass");
  const sourcePng = await sharp(sourceRaw, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
  // Readable image for storage validation, explicitly NOT a child/photo/identity approval.
  const identityBytes = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 160, g: 180, b: 200, alpha: 1 } } }).png().toBuffer();
  const settings = { image: { model: "gpt-image-2" as const, quality: "low" as const, size: "1024x1024" as const, background: "transparent" as const, outputFormat: "png" as const, n: 1 as const },
    observer: { model: "gpt-5.6-sol" as const, effort: "high" as const, version: "visible-landmarks/v1" as const }, promptSha256: hash("prompt"), styleReferenceSha256: hash("style"), wardrobeKey: "shared-outdoor" };
  const plan = frozenFixedWorldPlanSchema.parse({ version: "fixed-world-plan/v1", engine: "fixed-sprite/v3", variantPolicy: "A-only", foregroundPolicy: "per-appearance-premasked-only", bonusPolicy: "disabled",
    world: { slug: world.slug, version: world.version, definitionSha256: fixedWorldJsonSha256(world) }, identitySha256: sha256Bytes(identityBytes),
    sourceGroups: [{ key: "outdoor", settings, settingsSha256: fixedWorldJsonSha256(settings) }],
    boards: scenes.map(scene => ({ slug: scene.slug, sceneVersion: scene.version, definitionSha256: fixedWorldJsonSha256(scene), board,
      appearances: scene.targets.map((target, i) => {
        const contract = fixedSlotV3ContractSchema.parse({ version: "fixed-sprite/v3", measurementVersion: "visible-face/v1", poseId: "standing", board, slotId: `${scene.slug}/${target.id}/frozen`,
          support: { type: "occluded-standing", sourceLandmark: "eyeMidpoint", destination: { x: (60 + i * 100) / 320, y: 100 / 320 }, tolerancePx: 4 },
          scale: { kind: "landmark-distance", from: "eyeMidpoint", to: "chin", destinationDistancePx: 7, tolerancePx: 1 },
          bodyScale: { kind: "landmark-distance-interval", from: "eyeMidpoint", to: "soleMidpoint", minDistancePx: 70, maxDistancePx: 90 },
          requiredHiddenLandmarks: [{ sourceLandmark: "leftFoot", radiusPx: 2 }, { sourceLandmark: "rightFoot", radiusPx: 2 }], anchorChecks: [], allowedEnvelope: polygon(0, 0, 1, 1), forbiddenRegions: [],
          foregroundMask: { width: 320, height: 320, rgbaSha256: sha256Rgba(foreground.rgba, 320, 320), mode: "board-foreground-alpha" } });
        return { targetId: target.id, sourceKey: "outdoor", contract, contractSha256: sha256Bytes(Buffer.from(JSON.stringify(contract))), hintRadius: 0.1,
          copy: { mission: text("Find {name}"), item: text("The solid crate"), success: [text("You found {name}!")], hintText: text("Look behind the solid crate") } };
      }) })),
  });
  const qualifiedSource = { status: "qualified" as const, key: "outdoor", identitySha256: plan.identitySha256, settings, settingsSha256: fixedWorldJsonSha256(settings), encodedPng: sourcePng,
    sourceImageSha256: sha256Bytes(sourcePng), sourceRgbaSha256: source.measurementFrame.rgbaSha256, measurement: extracted.source,
    measurementSha256: fixedWorldJsonSha256(extracted.source), observationReceiptSha256: hash("qualified-observer-receipt"), imageRequest: requestRef("image"), observerRequest: requestRef("observer") };
  const planSha256 = fixedWorldJsonSha256(plan);
  const appearances: QualifiedFixedWorldAppearance[] = plan.boards.flatMap((b, boardIndex) => b.appearances.map(slot => {
    const placement = computeFixedPlacement({ contract: slot.contract, sprite: extracted, board, foreground });
    assert.equal(placement.ok, true, placement.flags.map(flag => flag.code).join(","));
    const patch = placement.composite;
    const runtimeSlot = fixedWorldRuntimeSlot(slot, "en", "Fixture Child");
    const exported = adaptFixedSpriteForPlayer({ exportMode: "board-raster", placement, extracted, foreground, contractSha256: slot.contractSha256,
      boardAsset: { ...board, url: scenes[boardIndex]!.art.base }, asset: { url: `/api/assets/${b.slug}-${slot.targetId}`, width: patch.width, height: patch.height, rgbaSha256: sha256Rgba(patch.rgba, patch.width, patch.height) },
      runtime: { art: { base: scenes[boardIndex]!.art.base, width: 320, height: 320 }, slot: { id: runtimeSlot.id, flip: false, rotation: 0, layer: "front", zIndex: 30 } } });
    const appearanceSha256 = fixedWorldAppearanceSha256({ planSha256, boardSlug: b.slug, targetId: slot.targetId, sourceKey: "outdoor", source: qualifiedSource, exported });
    return { boardSlug: b.slug, targetId: slot.targetId, sourceKey: "outdoor", variant: "A", exported, foreground, reviewContext: boardPng,
      reviews: (["semantic", "browser"] as const).map(kind => ({ version: "fixed-world-review/v1" as const, status: "approved" as const, kind, planSha256, appearanceSha256, contextSha256: sha256Bytes(boardPng), reviewer: { kind: "human" as const, id: "synthetic-test-reviewer" }, reviewedAt: "2026-09-08T12:00:00.000Z",
        ...(kind === "browser" ? { capture: { renderer: "SceneViewport" as const, browser: "synthetic-test-browser", viewportWidth: 1280, viewportHeight: 720, deviceScaleFactor: 1, screenshotSha256: hash("synthetic capture, no actual browser launched"), appearanceSha256 } } : {}) })) as QualifiedFixedWorldAppearance["reviews"] };
  }));
  const snapshot = { worldId: "game-test:journey", requests: [request("identity", "identity"), request("image", "image"), request("observer", "judge")] };
  return { plan, planSha256, world, scenes, originalBoards: names.map(slug => ({ slug, bytes: boardPng })), identity: { bytes: identityBytes, sha256: plan.identitySha256, request: requestRef("identity") }, sources: [qualifiedSource], appearances,
    budget: { worldId: snapshot.worldId, snapshot, snapshotSha256: fixedWorldJsonSha256(snapshot) }, game: { id: "game-test", childName: "Fixture Child", avatarUrl: "/api/assets/avatar", locale: "en", styleVersion: "fixed-world-v1", composedAt: "2026-09-08T12:00:00.000Z" } };
}
