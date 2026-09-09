import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareBoardConditionedSource, type BoardConditioningInput } from "../board-conditioned-source";

export const sourcePolicy = { reserveMicroUsd: 200_000, providerNamespace: "test-project", timeoutMs: 1000,
  rateCard: { id: "fixture", textInput: 5, imageInput: 8, imageOutput: 30 } };
const bound = (png: Buffer) => ({ png, sha256: createHash("sha256").update(png).digest("hex") });
export async function conditioningFixture(): Promise<BoardConditioningInput> {
  const png = await sharp({ create: { width: 120, height: 120, channels: 4, background: "#384970" } }).png().toBuffer();
  const foreground = await sharp({ create: { width: 120, height: 120, channels: 4, background: "#384970" } }).png().toBuffer();
  return { boardId: "tokyo", board: bound(png), child: { profileId: "test-child", ageYears: 8, illustratedIdentity: bound(png), referenceRole: "illustrated-identity" },
    slots: ["front-peek", "side-lean", "wave-peek"].map((pose, i) => ({
      slot: { id: `slot-${i}`, pose: pose as "front-peek" | "side-lean" | "wave-peek", eye: { x: 20 + i * 40, y: 50 }, faceHeightPx: 8, window: { left: i * 40, top: 0, width: 40, height: 120 } },
      foreground: bound(foreground), context: { left: i * 40, top: 0, width: 40, height: 120 }, originalPeople: { left: i * 40, top: 5, width: 20, height: 30 },
      poseDescription: `Pose ${pose} with natural arms and a playful expression`, wardrobe: "Subdued pink cardigan and cotton shirt",
      lighting: { key: i === 1 ? "Cool blue street light" : "Soft amber light from above right", fill: "Restrained violet ambient fill", shadows: "Broad cool painted shadows", exposure: "No brighter than nearby original faces" },
    })) };
}

describe("board-specific LOW source preparation", () => {
  it("binds the explicitv3 crown policy into a new contract without changing historicalv2 fingerprints", async () => {
    const input = await conditioningFixture();
    Object.assign(input.slots[0]!.slot, { mode: "open", pose: "standing", supportPointPx: { x: 20, y: 110 }, standingHeightPx: 65,
      pixelRefinement: "bounded-transform-one-board-pixel/v2" });
    const previous = await prepareBoardConditionedSource(input, sourcePolicy);
    input.slots[0]!.slot.pixelRefinement = "connected-crown-fringe-bounded-feet/v3";
    const revised = await prepareBoardConditionedSource(input, sourcePolicy);
    expect(revised.contractSha256).not.toBe(previous.contractSha256);
    expect(revised.contract.directions[0]!.slot.pixelRefinement).toBe("connected-crown-fringe-bounded-feet/v3");
    input.slots[0]!.slot.pixelRefinement = "bounded-transform-one-board-pixel/v2";
    expect((await prepareBoardConditionedSource(input, sourcePolicy)).prepared.fingerprint).toBe(previous.prepared.fingerprint);
    input.slots[1]!.slot.pixelRefinement = "connected-crown-fringe-bounded-feet/v3";
    await expect(prepareBoardConditionedSource(input, sourcePolicy)).rejects.toThrow("explicit open placement");
  });
  it("opts open figures into local saturation and shade matching without altering historical prompts", async () => {
    const input = await conditioningFixture();
    Object.assign(input.slots[0]!.slot, { mode: "open", pose: "standing", supportPointPx: { x: 20, y: 110 }, standingHeightPx: 65 });
    input.sourcePresentation = "local-composite/v4";
    const old = await prepareBoardConditionedSource(input, sourcePolicy);
    input.sourcePresentation = "local-composite/v5";
    const matched = await prepareBoardConditionedSource(input, { ...sourcePolicy, quality: "medium" });
    expect(matched.prepared.prompt).toContain("illumination AT THE MARK");
    expect(matched.prepared.prompt).toContain("restrained saturation");
    expect(matched.prepared.prompt).toContain("or brighter heroine");
    expect(matched.prepared.prompt).toContain("BOTH visible shoes");
    expect(matched.contract.directions).toEqual(old.contract.directions);
    expect(matched.prepared.capture.settings.quality).toBe("medium");
    input.sourcePresentation = "local-composite/v4";
    expect((await prepareBoardConditionedSource(input, sourcePolicy)).prepared.fingerprint).toBe(old.prepared.fingerprint);
  });
  it("requests full shoes only for open placements and preserves board-specific lighting and clothing", async () => {
    const input = await conditioningFixture();
    Object.assign(input.slots[0]!.slot, { mode: "open", pose: "standing", supportPointPx: { x: 20, y: 110 }, standingHeightPx: 65 });
    input.slots[0]!.wardrobe = "Insulated winter jacket, long trousers, gloves and winter boots";
    const out = await prepareBoardConditionedSource(input, { ...sourcePolicy, quality: "medium" });
    expect(out.prepared.prompt).toContain("BOTH visible shoes");
    expect(out.prepared.prompt).toContain(input.slots[0]!.wardrobe);
    expect(out.prepared.prompt).toContain(input.slots[0]!.lighting.key);
    expect(out.prepared.prompt).not.toContain("Existing fixed foreground masks will hide the lower torso");
    expect(out.prepared.capture.settings.quality).toBe("medium");
    delete input.slots[0]!.slot.supportPointPx;
    await expect(prepareBoardConditionedSource(input, sourcePolicy)).rejects.toThrow("support");
  });
  it("binds marked local lighting references without moving slots or changing board pixels", async () => {
    const input = await conditioningFixture(), originalBoard = Buffer.from(input.board.png);
    const legacy = await prepareBoardConditionedSource(input, sourcePolicy);
    input.sourcePresentation = "local-composite/v4";
    const local = await prepareBoardConditionedSource(input, sourcePolicy);
    expect(local.contract.directions).toEqual(legacy.contract.directions);
    expect(local.contract.cells).toEqual(legacy.contract.cells);
    expect(local.input.board.png).toEqual(originalBoard);
    expect(local.prepared.stylePng).not.toEqual(legacy.prepared.stylePng);
    expect(local.prepared.prompt).toContain("illumination AT THE MARK");
    expect(local.prepared.prompt).toContain("skin, hair and cloth golden-orange");
    expect(local.prepared.prompt).toContain("without mandatory camera eye contact");
    expect(local.prepared.prompt).not.toContain("Avoid studio front lighting, bright orange hair rims");
    expect(local.prepared.capture.settings.quality).toBe("low");
    expect(Buffer.byteLength(local.prepared.prompt)).toBeLessThanOrEqual(8192);
  });
  it("opts into compact board-language drawing without changing geometry or legacy defaults", async () => {
    const input = await conditioningFixture(), legacy = await prepareBoardConditionedSource(input, sourcePolicy);
    input.sourcePresentation = "compact-board-paint/v2";
    const compact = await prepareBoardConditionedSource(input, sourcePolicy);
    expect(compact.contractSha256).not.toBe(legacy.contractSha256);
    expect(compact.contract.directions).toEqual(legacy.contract.directions);
    expect(compact.prepared.stylePng).toEqual(legacy.prepared.stylePng);
    expect(compact.prepared.prompt).toContain("STYLE AND LIGHT AUTHORITY");
    expect(compact.prepared.prompt).toContain("genuinely clear space on ALL sides");
    expect(compact.prepared.prompt).toContain("approximately 12 native pixels");
    expect(compact.prepared.capture.settings.quality).toBe("low");
    input.sourcePresentation = "compact-reference/v3";
    const compactReference = await prepareBoardConditionedSource(input, sourcePolicy);
    expect(compactReference.prepared.prompt).toBe(compact.prepared.prompt);
    expect(compactReference.prepared.identityPng).not.toEqual(compact.prepared.identityPng);
    expect(compactReference.contract.child).toEqual(compact.contract.child);
    expect(compactReference.contract.wireIdentitySha256).toBe(compactReference.prepared.capture.identitySha256);
    expect(compactReference.contract.directions).toEqual(compact.contract.directions);
    delete input.sourcePresentation;
    expect((await prepareBoardConditionedSource(input, sourcePolicy)).prepared.fingerprint).toBe(legacy.prepared.fingerprint);
    input.sourcePresentation = "unknown" as never;
    await expect(prepareBoardConditionedSource(input, sourcePolicy)).rejects.toThrow("unknown source presentation");
  });
  it("builds a bounded actual-board atlas, three cell directions, and explicit illustrated identity role", async () => {
    const result = await prepareBoardConditionedSource(await conditioningFixture(), sourcePolicy);
    expect(await sharp(result.prepared.stylePng).metadata()).toMatchObject({ width: 1024, height: 1024 });
    expect(result.prepared.capture.settings).toMatchObject({ model: "gpt-image-2", quality: "low", n: 1 });
    expect(result.contract.cells.map(c => c.slotId)).toEqual(["slot-0", "slot-1", "slot-2"]);
    expect(result.prepared.prompt).toContain("Cool blue street light");
    expect(result.prepared.prompt).toContain("Soft amber light from above right");
    expect(result.prepared.prompt).toContain("ILLUSTRATED identity reference");
    expect(result.prepared.prompt).toContain("SAME 8-year-old child");
    expect(result.prepared.prompt).not.toContain("test-child");
    expect(Buffer.byteLength(result.prepared.prompt)).toBeLessThanOrEqual(8192);
  });
  it("pins lighting, poses, child and board separately; lighting never changes fixed anchors", async () => {
    const input = await conditioningFixture(), baseline = await prepareBoardConditionedSource(input, sourcePolicy);
    input.slots[1]!.lighting.key = "Warm candlelight from below left";
    const lit = await prepareBoardConditionedSource(input, sourcePolicy);
    expect(lit.contractSha256).not.toBe(baseline.contractSha256);
    expect(lit.prepared.fingerprint).not.toBe(baseline.prepared.fingerprint);
    expect(lit.contract.directions.map(d => d.slot)).toEqual(baseline.contract.directions.map(d => d.slot));
    input.child.profileId = "another-child";
    expect((await prepareBoardConditionedSource(input, sourcePolicy)).prepared.fingerprint).not.toBe(lit.prepared.fingerprint);
  });
  it("supports relighting an existing illustrated family only with its exact cell-to-pose mapping", async () => {
    const input = await conditioningFixture(); input.child.referenceRole = "matching-pose-edit-target";
    await expect(prepareBoardConditionedSource(input, sourcePolicy)).rejects.toThrow("pose mapping");
    input.child.matchingPoseIds = input.slots.map(s => s.slot.pose);
    expect((await prepareBoardConditionedSource(input, sourcePolicy)).prepared.prompt).toContain("ILLUSTRATED EDIT TARGET");
    input.child.matchingPoseIds.reverse();
    await expect(prepareBoardConditionedSource(input, sourcePolicy)).rejects.toThrow("pose mapping");
  });
  it("refuses generic identical poses, missing local references, identity drift and bad board masks before spend", async () => {
    let input = await conditioningFixture(); input.slots.forEach(s => { s.slot.pose = "front-peek"; });
    await expect(prepareBoardConditionedSource(input, sourcePolicy)).rejects.toThrow("pose variety");
    input = await conditioningFixture(); input.slots[0]!.context.left = 121;
    await expect(prepareBoardConditionedSource(input, sourcePolicy)).rejects.toThrow("outside static board");
    input = await conditioningFixture(); input.child.illustratedIdentity.sha256 = "0".repeat(64);
    await expect(prepareBoardConditionedSource(input, sourcePolicy)).rejects.toThrow("frozen hash");
    input = await conditioningFixture(); input.slots[0]!.foreground = bound(await sharp({ create: { width: 120, height: 120, channels: 4, background: "red" } }).png().toBuffer());
    await expect(prepareBoardConditionedSource(input, sourcePolicy)).rejects.toThrow("exact static board");
  });
  it("takes byte and metadata copies before awaits", async () => {
    const input = await conditioningFixture(), pending = prepareBoardConditionedSource(input, sourcePolicy);
    input.child.ageYears = 2; input.slots[0]!.lighting.key = "MUTATED externally"; input.board.png.fill(0);
    const result = await pending;
    expect(result.contract.child.ageYears).toBe(8); expect(result.prepared.prompt).not.toContain("MUTATED");
  });
});
