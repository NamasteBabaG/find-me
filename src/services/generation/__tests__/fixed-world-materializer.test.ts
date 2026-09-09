import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { planScenePlay } from "../../../domain/game/replay";
import { sha256Bytes, sha256Rgba } from "../fixed-sprite";
import { fixedWorldJsonSha256, materializeFixedWorld, type FixedWorldMaterializerInput } from "../fixed-world-materializer";
import type { WorldBudgetRequest, WorldBudgetScope } from "../world-budget";
import { createFixedWorldFixture } from "./helpers/fixed-world-fixture";
const hash = (value: string) => sha256Bytes(Buffer.from(value));
const request = (key: string, scope: WorldBudgetScope): WorldBudgetRequest => ({
  requestKey: key, scope, operationFingerprint: `operation:${key}`, reserveMicroUsd: 10_000, origin: "reserved", unknownReasons: [], conflicts: [], state: "settled",
  evidence: { providerNamespace: "test-account", providerRequestId: `provider:${key}`, usageId: `usage:${key}`, rawUsage: { tokens: 1 }, model: scope === "judge" ? "gpt-5.6-sol" : "gpt-image-2", amountMicroUsd: 10_000, costBasis: "conservative-upper-estimate" },
});
const requestRef = (key: string) => ({ requestKey: key, operationFingerprint: `operation:${key}` });
let baseline: FixedWorldMaterializerInput;

beforeAll(async () => {
  baseline = await createFixedWorldFixture();
}, 30_000);

const fixture = () => structuredClone(baseline);
function rehashPlan(input: FixedWorldMaterializerInput) { input.planSha256 = fixedWorldJsonSha256(input.plan); }

describe("fixed world materializer (synthetic qualification receipts only)", () => {
  it("emits nine real scenes and 27 A-only raster writes without legacy slots or fallback", async () => {
    const input = fixture(), before = fixedWorldJsonSha256(input.scenes), result = await materializeFixedWorld(input);
    expect(result.config.scenes).toHaveLength(9); expect(result.assetWrites).toHaveLength(27);
    expect(result.config.packageTier).toBe("ONE_WORLD"); expect(result.config.worlds?.[0]?.nodes).toHaveLength(9);
    for (const scene of result.config.scenes) {
      expect(scene.art).not.toHaveProperty("foreground"); expect(scene).not.toHaveProperty("bonus");
      for (const target of scene.targets) {
        expect(target.sprite).toEqual(target.spriteByVariant!.A); expect(Object.keys(target.spriteByVariant!)).toEqual(["A"]);
        expect(target.slots[0]).toMatchObject({ flip: false, rotation: 0, layer: "front", zIndex: 30 });
        expect(target.slots[0].id).toContain("/frozen"); expect(target.slots[1].id).toContain(":inactive-B");
        expect(target.mission).toBe("Find Fixture Child"); expect(target.targetType).toBe("fixed-standing-peek");
      }
      expect(Object.values(planScenePlay(scene, { plays: 3 }, "test").variants)).toEqual(["A", "A", "A"]);
    }
    expect(fixedWorldJsonSha256(input.scenes)).toBe(before);
    expect(result).toMatchObject({ automaticRelease: false, persistenceStatus: "not-written" });
    expect(JSON.stringify(result.config)).not.toContain("sourceImageSha256");
    expect(JSON.stringify(result.config)).not.toContain("synthetic-test-reviewer");
    expect(result.assetWrites[0]!.rgba).toEqual(Buffer.from(input.appearances[0]!.exported.rasterAsset.rgba));
  });
  it("returns detached lossless pixels, preserving a non-square raster", async () => {
    const input = fixture(), result = await materializeFixedWorld(input), write = result.assetWrites[0]!;
    expect(write.width).not.toBe(write.height); expect(write.rgbaSha256).toBe(sha256Rgba(write.rgba, write.width, write.height));
    const before = input.appearances[0]!.exported.rasterAsset.rgba[0]; write.rgba[0] = 1;
    expect(input.appearances[0]!.exported.rasterAsset.rgba[0]).toBe(before);
  });
  it("accepts compressed original masks, decoding sequentially instead of requiring 27 full-board RGBA buffers", async () => {
    const input = fixture(), rawResult = await materializeFixedWorld(input), foreground = input.appearances[0]!.foreground;
    if ("png" in foreground) throw new Error("raw fixture required");
    const png = await sharp(foreground.rgba, { raw: { width: foreground.width, height: foreground.height, channels: 4 } }).png().toBuffer();
    for (const appearance of input.appearances) appearance.foreground = { png };
    const encodedResult = await materializeFixedWorld(input);
    expect(encodedResult.config).toEqual(rawResult.config);
    expect(encodedResult.assetWrites.map(write => write.rgba)).toEqual(rawResult.assetWrites.map(write => write.rgba));
    expect(encodedResult.provenance).toEqual(rawResult.provenance);
  });
  it.each(["unreadable", "truncated", "dimensions", "format"])("rejects %s encoded foreground", async what => {
    const input = fixture(), foreground = input.appearances[0]!.foreground;
    if ("png" in foreground) throw new Error("raw fixture required");
    let png = await sharp(foreground.rgba, { raw: { width: 320, height: 320, channels: 4 } }).png().toBuffer();
    if (what === "unreadable") png = Buffer.from("not a PNG");
    if (what === "truncated") png = png.subarray(0, 80);
    if (what === "dimensions") png = await sharp(png).resize(321, 320).png().toBuffer();
    if (what === "format") png = await sharp(png).jpeg().toBuffer();
    input.appearances[0]!.foreground = { png };
    await expect(materializeFixedWorld(input)).rejects.toThrow();
  });
  it("snapshots compressed mask bytes before asynchronous decoding", async () => {
    const input = fixture(), foreground = input.appearances[0]!.foreground;
    if ("png" in foreground) throw new Error("raw fixture required");
    const png = await sharp(foreground.rgba, { raw: { width: 320, height: 320, channels: 4 } }).png().toBuffer();
    for (const appearance of input.appearances) appearance.foreground = { png };
    const promise = materializeFixedWorld(input);
    png.fill(0);
    await expect(promise).resolves.toMatchObject({ persistenceStatus: "not-written" });
  });
  it.each(["missing", "duplicate", "extra", "wrong-target", "B"])("rejects %s appearance coverage", async mode => {
    const input = fixture();
    if (mode === "missing") input.appearances.pop();
    if (mode === "duplicate") input.appearances[26] = input.appearances[0]!;
    if (mode === "extra") input.appearances.push(structuredClone(input.appearances[0]!));
    if (mode === "wrong-target") input.appearances[26]!.targetId = "not-in-plan";
    if (mode === "B") (input.appearances[26] as unknown as { variant: string }).variant = "B";
    await expect(materializeFixedWorld(input)).rejects.toThrow();
  });
  it.each(["board", "identity", "source", "mask", "raster", "settings", "measurement", "scene", "world", "plan"])("rejects changed %s bytes or hash binding", async what => {
    const input = fixture();
    if (what === "board") input.originalBoards[0]!.bytes[0] = input.originalBoards[0]!.bytes[0]! ^ 1;
    if (what === "identity") input.identity.bytes[0] = input.identity.bytes[0]! ^ 1;
    if (what === "source") input.sources[0]!.encodedPng[0] = input.sources[0]!.encodedPng[0]! ^ 1;
    if (what === "mask") { const mask = input.appearances[0]!.foreground; if ("png" in mask) throw new Error("raw fixture required"); mask.rgba[140 * 320 * 4] = mask.rgba[140 * 320 * 4]! ^ 1; }
    if (what === "raster") input.appearances[0]!.exported.rasterAsset.rgba[0] = input.appearances[0]!.exported.rasterAsset.rgba[0]! ^ 1;
    if (what === "settings") input.sources[0]!.settings.wardrobeKey = "different";
    if (what === "measurement") input.sources[0]!.measurement.landmarks.chin.x += 0.001;
    if (what === "scene") input.scenes[0]!.name.en += "changed";
    if (what === "world") input.world.version++;
    if (what === "plan") input.plan.boards[0]!.appearances[0]!.hintRadius += 0.01;
    await expect(materializeFixedWorld(input)).rejects.toThrow();
  });
  it.each(["unknown", "pending", "over-cap", "missing-charge", "wrong-world"])("refuses %s budget before materialization", async what => {
    const input = fixture();
    if (what === "unknown" || what === "pending") input.budget.snapshot.requests = [{ ...request("pending", "judge"), state: what, unknownReasons: what === "unknown" ? ["503 unreadable"] : [] }];
    if (what === "over-cap") { const row = request("expensive", "image"); if (row.state === "settled") { row.reserveMicroUsd = 6_000_000; row.evidence.amountMicroUsd = 6_000_000; } input.budget.snapshot.requests = [row]; }
    if (what === "missing-charge") input.budget.snapshot.requests = [];
    if (what === "wrong-world") input.budget.worldId = "different-game:journey";
    input.budget.snapshotSha256 = fixedWorldJsonSha256(input.budget.snapshot);
    await expect(materializeFixedWorld(input)).rejects.toThrow();
  });
  it.each(["pending", "rejected", "missing", "stale-raster", "stale-context", "native-detail"])("refuses %s review on the final appearance, never returning partial writes", async what => {
    const input = fixture(), item = input.appearances[26]!;
    if (what === "pending" || what === "rejected") (item.reviews[0] as unknown as { status: string }).status = what;
    if (what === "missing") item.reviews.pop();
    if (what === "stale-raster" || what === "native-detail") item.reviews[0]!.appearanceSha256 = hash(what);
    if (what === "stale-context") item.reviewContext = Buffer.from("unreviewed context");
    await expect(materializeFixedWorld(input)).rejects.toThrow();
  });
  it.each(["flip", "foreground", "adjust", "position", "fallback"])("rejects %s runtime divergence", async what => {
    const input = fixture(), out = input.appearances[0]!.exported;
    if (what === "flip") out.provenance.runtime.slot.flip = true;
    if (what === "foreground") out.provenance.runtime.art.foreground = "/legacy-foreground.png";
    if (what === "adjust") out.provenance.runtime.adjust.dx = 0.01;
    if (what === "position") out.sprite.rect.x += 0.001;
    if (what === "fallback") (out.sprite as unknown as { kind: string }).kind = "composed";
    await expect(materializeFixedWorld(input)).rejects.toThrow();
  });
  it("rejects a mask whose new hash is frozen but whose pixels repaint the original", async () => {
    const input = fixture(), item = input.appearances[0]!, slot = input.plan.boards[0]!.appearances[0]!;
    if ("png" in item.foreground) throw new Error("raw fixture required");
    item.foreground.rgba[140 * 320 * 4] = 250;
    slot.contract.foregroundMask!.rgbaSha256 = sha256Rgba(item.foreground.rgba, 320, 320);
    item.exported.provenance.placementMaskRgbaSha256 = slot.contract.foregroundMask!.rgbaSha256;
    slot.contractSha256 = sha256Bytes(Buffer.from(JSON.stringify(slot.contract))); item.exported.provenance.contractSha256 = slot.contractSha256; rehashPlan(input);
    await expect(materializeFixedWorld(input)).rejects.toThrow("exact original");
  });
  it("requires explicit foreground policy and both-foot guards in the frozen plan", async () => {
    const input = fixture(); delete (input.plan as unknown as { foregroundPolicy?: string }).foregroundPolicy;
    await expect(materializeFixedWorld(input)).rejects.toThrow();
    const noFeet = fixture(); delete noFeet.plan.boards[0]!.appearances[0]!.contract.requiredHiddenLandmarks;
    noFeet.plan.boards[0]!.appearances[0]!.contractSha256 = sha256Bytes(Buffer.from(JSON.stringify(noFeet.plan.boards[0]!.appearances[0]!.contract))); rehashPlan(noFeet);
    await expect(materializeFixedWorld(noFeet)).rejects.toThrow("sole guards");
  });
  it.each(["pending", "failed"])("rejects %s source qualifications", async status => {
    const input = fixture(); (input.sources[0] as unknown as { status: string }).status = status;
    await expect(materializeFixedWorld(input)).rejects.toThrow("source");
  });
  it.each(["image", "observer"])("rejects a settled %s bill for a different model", async key => {
    const input = fixture(), row = input.budget.snapshot.requests.find(item => item.requestKey === key)!;
    if (row.state === "settled") row.evidence.model = "unapproved-model";
    input.budget.snapshotSha256 = fixedWorldJsonSha256(input.budget.snapshot);
    await expect(materializeFixedWorld(input)).rejects.toThrow("model");
  });
  it.each(["mask-provenance", "native-detail", "hit", "eye"])("checks %s against the actual board-raster export", async what => {
    const input = fixture(), out = input.appearances[0]!.exported;
    if (what === "mask-provenance") out.provenance.placementMaskRgbaSha256 = hash("other-mask");
    if (what === "native-detail") (out.provenance.semanticReviewRequirement as unknown as { nativeDetailApprovalSufficient: boolean }).nativeDetailApprovalSufficient = true;
    if (what === "hit") out.sprite.hitRect.x += 0.001;
    if (what === "eye") out.sprite.anchor.x += 0.001;
    await expect(materializeFixedWorld(input)).rejects.toThrow();
  });
  it.each(["wrong-model", "wrong-effort", "unbooked", "ledger-model"])("rejects %s provider semantic review", async what => {
    const input = fixture(), semantic = input.appearances[0]!.reviews.find(review => review.kind === "semantic")!;
    semantic.reviewer = { kind: "provider", id: "paid-semantic-review", model: "gpt-5.6-sol", effort: "high", request: requestRef(what === "unbooked" ? "not-paid" : "semantic") };
    if (what === "wrong-model") (semantic.reviewer as unknown as { model: string }).model = "old-model";
    if (what === "wrong-effort") (semantic.reviewer as unknown as { effort: string }).effort = "low";
    const row = request("semantic", "judge"); if (row.state === "settled" && what === "ledger-model") row.evidence.model = "old-model";
    input.budget.snapshot.requests = [...input.budget.snapshot.requests, row]; input.budget.snapshotSha256 = fixedWorldJsonSha256(input.budget.snapshot);
    await expect(materializeFixedWorld(input)).rejects.toThrow();
  });
  it("accepts a booked Sol HIGH semantic review but never substitutes it for browser evidence", async () => {
    const input = fixture(), semantic = input.appearances[0]!.reviews.find(review => review.kind === "semantic")!;
    semantic.reviewer = { kind: "provider", id: "paid-semantic-review", model: "gpt-5.6-sol", effort: "high", request: requestRef("semantic") };
    input.budget.snapshot.requests = [...input.budget.snapshot.requests, request("semantic", "judge")]; input.budget.snapshotSha256 = fixedWorldJsonSha256(input.budget.snapshot);
    await expect(materializeFixedWorld(input)).resolves.toMatchObject({ persistenceStatus: "not-written" });
    const browser = input.appearances[0]!.reviews.find(review => review.kind === "browser")!;
    (browser as unknown as { reviewer: unknown }).reviewer = semantic.reviewer;
    await expect(materializeFixedWorld(input)).rejects.toThrow();
  });
  it.each(["missing", "stale"])("rejects %s browser runtime capture", async what => {
    const input = fixture(), browser = input.appearances[0]!.reviews.find(review => review.kind === "browser")!;
    if (what === "missing") delete (browser as unknown as { capture?: unknown }).capture;
    else browser.capture.appearanceSha256 = hash("old appearance");
    await expect(materializeFixedWorld(input)).rejects.toThrow();
  });
  it("rejects nonfinite/cyclic JSON and has stable property-order-independent receipt hashes", () => {
    expect(fixedWorldJsonSha256({ x: 1, y: 2 })).toBe(fixedWorldJsonSha256({ y: 2, x: 1 }));
    expect(() => fixedWorldJsonSha256({ x: NaN })).toThrow();
    const cycle: { self?: unknown } = {}; cycle.self = cycle; expect(() => fixedWorldJsonSha256(cycle)).toThrow();
  });
});
