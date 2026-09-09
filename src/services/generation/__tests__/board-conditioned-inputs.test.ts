import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { BoardConditioningInputError, loadBoardConditioningInputs, type LoadBoardConditioningInputsOptions } from "../../../../scripts/board-conditioned-inputs";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) {
    if (path.dirname(dir) !== os.tmpdir() || !path.basename(dir).startsWith("find-me-conditioning-inputs-")) throw new Error("unsafe test cleanup path");
    await rm(dir, { recursive: true, force: true });
  }
});
async function fixture(webp = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), "find-me-conditioning-inputs-")); directories.push(root);
  const save = async (name: string, bytes: Buffer) => {
    await writeFile(path.join(root, name), bytes);
    return { path: name, sha256: sha(bytes) };
  };
  const json = (value: unknown) => Buffer.from(JSON.stringify(value));
  const boardPng = await sharp({ create: { width: 120, height: 120, channels: 4, background: "#384970" } }).png().toBuffer();
  const boardBytes = webp ? await sharp(boardPng).webp({ lossless: true }).toBuffer() : boardPng;
  const board = await save(webp ? "board.webp" : "board.png", boardBytes);
  const foreground = await save("foreground.png", boardPng), identity = await save("illustrated.png", boardPng);
  const metadata = await save("metadata.json", json({ fixture: true }));
  const poses = ["front-peek", "side-lean", "wave-peek"] as const;
  const slots = await Promise.all(poses.map(async (pose, i) => {
    const window = { left: i * 40, top: 0, width: 40, height: 120 };
    const person = { left: i * 40 + 1, top: 5, width: 12, height: 25 };
    const slot = { id: `test-slot-${i}`, pose, eye: { x: i * 40 + 20, y: 50 }, faceHeightPx: 8, window,
      forbiddenRects: [{ id: "original-child-face", left: person.left, top: person.top, width: 10, height: 10 }],
      forbiddenPolygons: [{ id: "original-child-hand", polygon: [{ x: i * 40 + 1, y: 30 }, { x: i * 40 + 3, y: 30 }, { x: i * 40 + 2, y: 32 }] }] };
    const result = await save(`result-${i}.json`, json({ slot, boardSha256: board.sha256, foregroundSha256: foreground.sha256 }));
    // Old descriptive pose label can differ, but actual retained source and geometry cannot.
    const contract = await save(`contract-${i}.json`, json({ slot: { ...slot, pose: "crouch" }, boardSha256: board.sha256, foregroundSha256: foreground.sha256 }));
    const crop = await save(`crop-${i}.png`, await sharp(boardPng).extract(window).png().toBuffer());
    const people = await save(`people-${i}.png`, await sharp(boardPng).extract(person).png().toBuffer());
    return { slotId: slot.id,
      placement: { contract, priorResultMetadata: result, foreground, eyeAnchorPx: slot.eye, eyeToChinPx: 8, contextRectPx: window, anchorMode: "fixed-eyeMidpoint" },
      references: { localStaticCrop: crop, localStaticCropRectPx: window, originalPersonExample: people, originalPersonExampleRectPx: person },
      pose: { family: pose as string, instruction: `Natural ${pose} pose, arms held close without props` },
      lighting: { keyDirection: "Upper-left soft sky light", colorTemperature: "Cool daylight", relativeIntensity: "Below nearby original highlights", fillAndBounce: "Subtle cool sky bounce", shadow: "Grouped painted shadow planes under hair and chin" } };
  }));
  const catalog = { schemaVersion: "find-me/board-visual-directions/v1", provenance: { selection: metadata },
    boards: [{ boardId: "fixture-board", staticArt: { ...board, width: 120, height: 120, containsPersonalizedChild: false }, sourceMetadata: metadata,
      wardrobe: "Muted pink cotton cardigan and blue trousers", slots }] };
  const writeCatalog = () => writeFile(path.join(root, "catalog.json"), json(catalog));
  await writeCatalog();
  const options: LoadBoardConditioningInputsOptions = { workspaceRoot: root, catalogPath: "catalog.json", boardIds: ["fixture-board"],
    child: { profileId: "child-eight", ageYears: 8 }, matchingPoseSheets: { "fixture-board": { ...identity, poseIds: [...poses] } } };
  return { root, save, json, options, catalog, writeCatalog, boardPng };
}

describe("local board-conditioning input loader", () => {
  it("allows versioned gaze/light directions but never slot, scale or mask overrides", async () => {
    const f = await fixture(), [baseline] = await loadBoardConditioningInputs(f.options);
    const [natural] = await loadBoardConditioningInputs({ ...f.options, sourcePresentation: "compact-reference/v3", slotDirectionOverrides: {
      "test-slot-0": { poseDescription: "Look toward the nearby child, not the camera" },
    } });
    expect(natural!.sourcePresentation).toBe("compact-reference/v3");
    expect(natural!.slots[0]!.poseDescription).toContain("not the camera");
    expect(natural!.slots.map(s => s.slot)).toEqual(baseline!.slots.map(s => s.slot));
    expect(natural!.slots.map(s => s.foreground)).toEqual(baseline!.slots.map(s => s.foreground));
    await expect(loadBoardConditioningInputs({ ...f.options, slotDirectionOverrides: { absent: { poseDescription: "Natural side gaze" } } })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(loadBoardConditioningInputs({ ...f.options, slotDirectionOverrides: { "test-slot-0": { slot: { faceHeightPx: 100 } } } as never })).rejects.toThrow();
  });
  it("loads exact per-board poses, real crop pixels, identity role and protected geometry without writes or API calls", async () => {
    const f = await fixture();
    const [input] = await loadBoardConditioningInputs(f.options);
    expect(input!.child).toMatchObject({ profileId: "child-eight", ageYears: 8, referenceRole: "matching-pose-edit-target", matchingPoseIds: ["front-peek", "side-lean", "wave-peek"] });
    expect(input!.slots.map(s => s.slot.pose)).toEqual(["front-peek", "side-lean", "wave-peek"]);
    expect(input!.slots[0]!.slot).toMatchObject({ eye: { x: 20, y: 50 }, faceHeightPx: 8,
      forbiddenRects: [{ id: "original-child-face" }], forbiddenPolygons: [{ id: "original-child-hand" }] });
    expect(input!.slots[1]!.lighting.key).toBe("Upper-left soft sky light; Cool daylight");
    expect(input!.board.sha256).toBe(sha(input!.board.png));
    input!.board.png.fill(0);
    expect(sha(await readFile(path.join(f.root, "board.png")))).toBe(f.catalog.boards[0]!.staticArt.sha256);
  });
  it("supports a lossless static WEBP input as a bound PNG without altering decoded pixels", async () => {
    const f = await fixture(true), [input] = await loadBoardConditioningInputs(f.options);
    expect((await sharp(input!.board.png).metadata()).format).toBe("png");
    const decoded = await sharp(input!.board.png).ensureAlpha().raw().toBuffer();
    expect(decoded.equals(await sharp(f.boardPng).ensureAlpha().raw().toBuffer())).toBe(true);
  });
  it("rejects stale hashes including non-image source metadata", async () => {
    const f = await fixture(); await writeFile(path.join(f.root, "metadata.json"), "{}");
    await expect(loadBoardConditioningInputs(f.options)).rejects.toMatchObject({ code: "HASH_MISMATCH" });
  });
  it("rejects a newly hashed but wrong original-person crop", async () => {
    const f = await fixture(), s = f.catalog.boards[0]!.slots[0]!;
    s.references.originalPersonExample = await f.save("wrong-people.png", await sharp({ create: { width: 12, height: 25, channels: 4, background: "red" } }).png().toBuffer());
    await f.writeCatalog();
    await expect(loadBoardConditioningInputs(f.options)).rejects.toMatchObject({ code: "REFERENCE_PIXEL_MISMATCH" });
  });
  it("rejects local catalog geometry drift even if metadata files remain valid", async () => {
    const f = await fixture(); f.catalog.boards[0]!.slots[0]!.placement.eyeAnchorPx.x++;
    await f.writeCatalog();
    await expect(loadBoardConditioningInputs(f.options)).rejects.toMatchObject({ code: "FROZEN_GEOMETRY_MISMATCH" });
  });
  it("never loads the legacy standing/sole contract as a simple peek", async () => {
    const f = await fixture(); f.catalog.boards[0]!.slots[0]!.placement.anchorMode = "legacy-soleMidpoint";
    await f.writeCatalog();
    try { await loadBoardConditioningInputs(f.options); throw new Error("must reject"); }
    catch (e) { expect(e).toBeInstanceOf(BoardConditioningInputError); expect(e).toMatchObject({ code: "UNSUPPORTED_SLOT_CONTRACT", slotId: "test-slot-0" }); }
  });
  it("maps an exact board-qualified legacy local ID without changing frozen geometry, rejecting arbitrary aliases", async () => {
    const f = await fixture(), s = f.catalog.boards[0]!.slots[0]!;
    s.slotId = `fixture-board-${s.slotId}`;
    await f.writeCatalog();
    const [input] = await loadBoardConditioningInputs(f.options);
    expect(input!.slots[0]!.slot).toMatchObject({ id: "fixture-board-test-slot-0", eye: { x: 20, y: 50 }, faceHeightPx: 8 });
    s.slotId = "other-board-test-slot-0"; await f.writeCatalog();
    await expect(loadBoardConditioningInputs(f.options)).rejects.toMatchObject({ code: "FROZEN_GEOMETRY_MISMATCH" });
  });
  it("refuses remote URLs, workspace escapes and wrong pose-sheet order", async () => {
    const f = await fixture();
    await expect(loadBoardConditioningInputs({ ...f.options, catalogPath: "https://example.test/catalog.json" })).rejects.toMatchObject({ code: "LOCAL_PATH_REQUIRED" });
    await expect(loadBoardConditioningInputs({ ...f.options, catalogPath: "../elsewhere.json" })).rejects.toMatchObject({ code: "LOCAL_PATH_REQUIRED" });
    f.options.matchingPoseSheets!["fixture-board"]!.path = "https://example.test/identity.png";
    await expect(loadBoardConditioningInputs(f.options)).rejects.toMatchObject({ code: "LOCAL_PATH_REQUIRED" });
    f.options.matchingPoseSheets!["fixture-board"]!.path = "illustrated.png";
    f.options.matchingPoseSheets!["fixture-board"]!.poseIds.reverse();
    await expect(loadBoardConditioningInputs(f.options)).rejects.toMatchObject({ code: "FROZEN_GEOMETRY_MISMATCH" });
  });
  it("supports identity-only input without claiming a matching three-pose layout", async () => {
    const f = await fixture(), [input] = await loadBoardConditioningInputs({ ...f.options, matchingPoseSheets: undefined, illustratedIdentity: { path: "illustrated.png" } });
    expect(input!.child.referenceRole).toBe("illustrated-identity"); expect(input!.child.matchingPoseIds).toBeUndefined();
  });
});
